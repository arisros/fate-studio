package core

import (
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/arisros/fate/describe"
	"github.com/arisros/fate/render"
)

// DefaultEditorURL opens a file in VS Code on the machine the browser runs on.
const DefaultEditorURL = "vscode://file{path}:{line}"

// SourceLink is one place in the code, with the URLs that open it.
type SourceLink struct {
	// File is the package import path joined with the file name.
	File string `json:"file"`
	Line int    `json:"line"`
	// Func is the Go function, for a guard or an action.
	Func string `json:"func,omitempty"`
	// Editor opens the file in a local editor. It is set only when the file
	// exists on the host the studio runs on.
	Editor string `json:"editor,omitempty"`
	// Permalink opens the file on the code host at the revision of the build.
	Permalink string `json:"permalink,omitempty"`
}

// MachineLinks links a machine's chart to its code, keyed by the ids of
// render.GraphJSON so a front end can look a node or an edge up directly.
type MachineLinks struct {
	Machine *SourceLink `json:"machine,omitempty"`
	// Modified reports that the build had uncommitted changes, so a permalink
	// may point a few lines off.
	Modified bool                 `json:"modified,omitempty"`
	Nodes    map[string]NodeLinks `json:"nodes,omitempty"`
	Edges    map[string]EdgeLinks `json:"edges,omitempty"`
}

// NodeLinks links one state. Entry and Exit line up with the node's action
// names; an element is nil when that action has no known location.
type NodeLinks struct {
	Self  *SourceLink   `json:"self,omitempty"`
	Entry []*SourceLink `json:"entry,omitempty"`
	Exit  []*SourceLink `json:"exit,omitempty"`
}

// EdgeLinks links one transition. Actions lines up with the edge's action
// names.
type EdgeLinks struct {
	Self    *SourceLink   `json:"self,omitempty"`
	Guard   *SourceLink   `json:"guard,omitempty"`
	Actions []*SourceLink `json:"actions,omitempty"`
}

// Sourced is implemented by a LiveInstance that knows where its machine is
// written. The one NewLiveActor returns does.
type Sourced interface {
	Sources() describe.MachineSources
}

// SetEditorURL sets the URL that opens a source file in an editor. {path} is
// replaced with the file's path on the studio's host, slash-separated and
// starting with a slash, and {line} with the line. An empty template turns
// editor links off.
func (s *Studio) SetEditorURL(template string) {
	s.mu.Lock()
	s.editorURL = template
	s.mu.Unlock()
}

// Sources returns where the named machine is written, as its live instance
// reports it. It reports false for a machine with no local simulator.
func (s *Studio) Sources(name string) (describe.MachineSources, bool) {
	entry, ok := s.Lookup(name)
	if !ok || entry.BuildLive == nil {
		return describe.MachineSources{}, false
	}
	src, ok := entry.BuildLive().(Sourced)
	if !ok {
		return describe.MachineSources{}, false
	}
	return src.Sources(), true
}

// Links turns a machine's source locations into links for its chart. States
// and transitions, which the engine cannot locate, are found by reading the
// machine's source file when it is on this host.
func (s *Studio) Links(name string, src describe.MachineSources) MachineLinks {
	s.mu.RLock()
	r := linker{editorURL: s.editorURL, build: src.Build}
	s.mu.RUnlock()

	out := MachineLinks{Machine: r.link(src.Machine)}
	if src.Build != nil {
		out.Modified = src.Build.Modified
	}
	entry, ok := s.Lookup(name)
	if !ok {
		return out
	}
	desc := entry.Build()
	idx := indexSource(src.Machine, desc)
	graph := render.GraphJSON(desc)

	out.Nodes = map[string]NodeLinks{}
	paths := map[string]string{}
	for _, n := range graph.Nodes {
		paths[n.ID] = n.Path
		ss := src.States[n.Path]
		nl := NodeLinks{Self: r.link(idx.state(n.Path)), Entry: r.links(ss.Entry), Exit: r.links(ss.Exit)}
		if nl.Self != nil || nl.Entry != nil || nl.Exit != nil {
			out.Nodes[n.ID] = nl
		}
	}

	out.Edges = map[string]EdgeLinks{}
	seen := map[string]int{}
	for _, e := range graph.Edges {
		statePath := paths[e.Source]
		key := e.Source + "\x00" + e.Event
		i := seen[key]
		seen[key]++
		el := EdgeLinks{Self: r.link(idx.transition(statePath, e.Event, i))}
		if ts := src.States[statePath].On[e.Event]; i < len(ts) {
			el.Guard = r.link(ts[i].Guard)
			el.Actions = r.links(ts[i].Actions)
		}
		if el.Self != nil || el.Guard != nil || el.Actions != nil {
			out.Edges[e.ID] = el
		}
	}
	return out
}

type linker struct {
	editorURL string
	build     *describe.SourceBuild
}

func (r linker) links(locs []*describe.SourceLocation) []*SourceLink {
	if len(locs) == 0 {
		return nil
	}
	out := make([]*SourceLink, len(locs))
	for i, l := range locs {
		out[i] = r.link(l)
	}
	return out
}

func (r linker) link(loc *describe.SourceLocation) *SourceLink {
	if loc == nil {
		return nil
	}
	l := &SourceLink{File: loc.File, Line: loc.Line, Func: loc.Func}
	local := loc.Path != "" && filepath.IsAbs(loc.Path) && fileExists(loc.Path)
	if local && r.editorURL != "" {
		p := filepath.ToSlash(loc.Path)
		if !strings.HasPrefix(p, "/") {
			p = "/" + p
		}
		l.Editor = strings.NewReplacer("{path}", p, "{line}", strconv.Itoa(loc.Line)).Replace(r.editorURL)
	}
	ref := r.ref()
	if ref == "" && local {
		ref = gitHead(filepath.Dir(loc.Path))
	}
	l.Permalink = permalink(r.build, loc, ref)
	return l
}

var releaseTag = regexp.MustCompile(`^v\d+\.\d+\.\d+$`)

// ref is the revision the build names: its commit, or its version when that is
// a plain release tag.
func (r linker) ref() string {
	switch {
	case r.build == nil:
		return ""
	case r.build.Revision != "":
		return r.build.Revision
	case releaseTag.MatchString(r.build.Version):
		return r.build.Version
	}
	return ""
}

var majorSuffix = regexp.MustCompile(`^v\d+$`)

// permalink builds a code host URL for a file of the main module. It knows the
// hosts whose module paths map onto a repository by convention.
func permalink(build *describe.SourceBuild, loc *describe.SourceLocation, ref string) string {
	if build == nil || ref == "" || !strings.HasPrefix(loc.File, build.Module+"/") {
		return ""
	}
	segs := strings.Split(build.Module, "/")
	if len(segs) < 3 {
		return ""
	}
	repo := strings.Join(segs[:3], "/")
	sub := segs[3:]
	if n := len(sub); n > 0 && majorSuffix.MatchString(sub[n-1]) {
		sub = sub[:n-1]
	}
	rel := path.Join(path.Join(sub...), strings.TrimPrefix(loc.File, build.Module+"/"))
	line := "#L" + strconv.Itoa(loc.Line)
	switch segs[0] {
	case "github.com":
		return "https://" + repo + "/blob/" + ref + "/" + rel + line
	case "gitlab.com":
		return "https://" + repo + "/-/blob/" + ref + "/" + rel + line
	}
	return ""
}

func fileExists(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && !fi.IsDir()
}

var hexSHA = regexp.MustCompile(`^[0-9a-f]{40,64}$`)

// gitHead returns the commit checked out in the repository that holds dir, or
// "" when there is none. It reads the repository's files directly, so it needs
// no git binary; the price is that it does not follow a linked worktree.
func gitHead(dir string) string {
	for {
		git := filepath.Join(dir, ".git")
		if fi, err := os.Stat(git); err == nil && fi.IsDir() {
			return readHead(git)
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func readHead(git string) string {
	b, err := os.ReadFile(filepath.Join(git, "HEAD"))
	if err != nil {
		return ""
	}
	head := strings.TrimSpace(string(b))
	ref, isRef := strings.CutPrefix(head, "ref: ")
	if !isRef {
		if hexSHA.MatchString(head) {
			return head
		}
		return ""
	}
	if b, err := os.ReadFile(filepath.Join(git, filepath.FromSlash(ref))); err == nil {
		if sha := strings.TrimSpace(string(b)); hexSHA.MatchString(sha) {
			return sha
		}
	}
	packed, err := os.ReadFile(filepath.Join(git, "packed-refs"))
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(packed), "\n") {
		if sha, name, ok := strings.Cut(line, " "); ok && name == ref && hexSHA.MatchString(sha) {
			return sha
		}
	}
	return ""
}
