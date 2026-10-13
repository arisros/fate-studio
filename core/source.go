package core

import (
	"errors"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

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
	// Open is the studio URL to POST to, relative to the studio's base path,
	// that opens the file with the editor command. It replaces Editor when an
	// editor command is set.
	Open string `json:"open,omitempty"`
	// Permalink opens the file on the code host at the revision of the build.
	Permalink string `json:"permalink,omitempty"`

	path string
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

// SetEditorCommand sets a command the studio runs on its own host to open a
// source file, for an editor that has no URL scheme. The command is split on
// spaces and run without a shell; {path} and {line} are replaced in each
// argument. While it is set, links carry Open instead of Editor. An empty
// command turns it off.
func (s *Studio) SetEditorCommand(command string) {
	s.mu.Lock()
	s.editorCmd = strings.Fields(command)
	s.mu.Unlock()
}

// ErrNoEditorCommand is returned by Open when no editor command is set.
var ErrNoEditorCommand = errors.New("studio: no editor command is set")

// ErrUnknownSource is returned by Open for a place that is not one of the
// machine's own source links.
var ErrUnknownSource = errors.New("studio: not a source location of this machine")

// editorWait is how long Open waits for the editor command to report a
// failure. A command still running after that is left to finish on its own.
const editorWait = 3 * time.Second

// Open runs the editor command on one of the named machine's source links,
// identified by the File and Line the link carries. It opens only places the
// studio itself reported, never a path the caller made up.
func (s *Studio) Open(name string, src describe.MachineSources, file string, line int) error {
	s.mu.RLock()
	command := s.editorCmd
	s.mu.RUnlock()
	if len(command) == 0 {
		return ErrNoEditorCommand
	}
	link := s.Links(name, src).find(file, line)
	if link == nil {
		return ErrUnknownSource
	}
	fill := strings.NewReplacer("{path}", link.path, "{line}", strconv.Itoa(link.Line))
	args := make([]string, len(command))
	for i, a := range command {
		args[i] = fill.Replace(a)
	}
	cmd := exec.Command(args[0], args[1:]...) //nolint:gosec // the operator's own command, on the studio's own source files
	var out strings.Builder
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if msg := strings.TrimSpace(out.String()); err != nil && msg != "" {
			return errors.New(msg)
		}
		return err
	case <-time.After(editorWait):
		return nil
	}
}

func (l MachineLinks) find(file string, line int) *SourceLink {
	match := func(c *SourceLink) bool {
		return c != nil && c.path != "" && c.File == file && c.Line == line
	}
	if match(l.Machine) {
		return l.Machine
	}
	for _, n := range l.Nodes {
		for _, c := range append(append([]*SourceLink{n.Self}, n.Entry...), n.Exit...) {
			if match(c) {
				return c
			}
		}
	}
	for _, e := range l.Edges {
		for _, c := range append([]*SourceLink{e.Self, e.Guard}, e.Actions...) {
			if match(c) {
				return c
			}
		}
	}
	return nil
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
	if len(s.editorCmd) > 0 {
		r.open = "m/" + url.PathEscape(name) + "/open"
	}
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
	// open is the studio URL that runs the editor command, when one is set.
	open  string
	build *describe.SourceBuild
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
	switch {
	case local && r.open != "":
		l.path = loc.Path
		l.Open = r.open + "?" + url.Values{"file": {loc.File}, "line": {strconv.Itoa(loc.Line)}}.Encode()
	case local && r.editorURL != "":
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
