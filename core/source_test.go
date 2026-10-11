package core_test

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/arisros/fate/describe"

	"github.com/arisros/fate-studio/core"
	"github.com/arisros/fate-studio/internal/demos"
)

const demoFile = "github.com/arisros/fate-studio/internal/demos/workflows.go"

func demoStudio(t *testing.T) *core.Studio {
	t.Helper()
	s := core.New()
	for _, d := range demos.All() {
		s.Register(d.Entry())
	}
	return s
}

// lineOf returns the 1-based line of the n-th line of the demo source that
// contains want, so the test does not break when the file is edited.
func lineOf(t *testing.T, want string, n int) int {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "internal", "demos", "workflows.go"))
	if err != nil {
		t.Fatal(err)
	}
	for i, line := range strings.Split(string(b), "\n") {
		if strings.Contains(line, want) {
			if n == 0 {
				return i + 1
			}
			n--
		}
	}
	t.Fatalf("%q not found in the demo source", want)
	return 0
}

func TestLinks_LocateStatesTransitionsGuardsAndActions(t *testing.T) {
	s := demoStudio(t)
	src, ok := s.Sources("ticket")
	if !ok {
		t.Fatal("the ticket demo should report its sources")
	}
	links := s.Links("ticket", src)

	if m := links.Machine; m == nil || m.File != demoFile || m.Line != lineOf(t, `ID:      "ticket"`, 0)-1 {
		t.Fatalf("machine link = %+v", m)
	}
	if !strings.HasPrefix(links.Machine.Editor, "vscode://file/") || !strings.HasSuffix(links.Machine.Editor, "workflows.go:"+itoa(links.Machine.Line)) {
		t.Errorf("editor link = %q", links.Machine.Editor)
	}

	triaged := links.Nodes["s_triaged"]
	if triaged.Self == nil || triaged.Self.Line != lineOf(t, `"triaged": step(`, 0) {
		t.Fatalf("triaged = %+v", triaged.Self)
	}

	// ROUTE is written once per transition, so each edge gets its own line.
	var routes []int
	for id, e := range links.Edges {
		if strings.HasPrefix(id, "s_triaged__ROUTE__") && e.Self != nil {
			routes = append(routes, e.Self.Line)
		}
	}
	if len(routes) != 3 || routes[0] == routes[1] || routes[1] == routes[2] || routes[0] == routes[2] {
		t.Errorf("ROUTE edges located at %v, want three different lines", routes)
	}

	var guard, act *core.SourceLink
	for id, e := range links.Edges {
		if !strings.HasPrefix(id, "s_review__NEXT__") {
			continue
		}
		if e.Guard != nil {
			guard = e.Guard
		}
		if len(e.Actions) == 1 && e.Actions[0] != nil {
			act = e.Actions[0]
		}
	}
	if guard == nil || guard.Line != lineOf(t, "c.Approvals >= 1 },", 0) || guard.Func == "" {
		t.Errorf("approved guard = %+v", guard)
	}
	if act == nil || act.Line != lineOf(t, `action.Named("recordApproval"`, 0) {
		t.Errorf("recordApproval action = %+v", act)
	}
}

func TestLinks_LocateEveryStateWrittenAsAKey(t *testing.T) {
	s := demoStudio(t)
	for _, name := range s.Machines() {
		if name == "media-player" {
			continue
		}
		src, ok := s.Sources(name)
		if !ok {
			t.Fatalf("%s reports no sources", name)
		}
		links := s.Links(name, src)
		entry, _ := s.Lookup(name)
		total, located := countStates(entry.Build().States), 0
		for _, n := range links.Nodes {
			if n.Self != nil {
				located++
			}
		}
		if located != total {
			t.Errorf("%s: located %d of %d states", name, located, total)
		}
	}
}

// The media player builds each region with a helper, so a region's states are
// not keys in the machine literal.
func TestLinks_StatesBuiltByAHelper(t *testing.T) {
	s := demoStudio(t)
	src, _ := s.Sources("media-player")
	links := s.Links("media-player", src)

	named := links.Nodes["s_playing_audio_decoding_audio"]
	if named.Self == nil || named.Self.File != "github.com/arisros/fate-studio/internal/demos/demos.go" {
		t.Fatalf("decoding_audio = %+v, want the line that passes its name to the helper", named.Self)
	}
	if audio := links.Nodes["s_playing_audio"]; audio.Self == nil || audio.Self.Line != named.Self.Line {
		t.Errorf("audio = %+v, want line %d", audio.Self, named.Self.Line)
	}
	if done, ok := links.Nodes["s_playing_audio_done"]; ok {
		t.Errorf("done is written only inside the shared helper and should stay unlocated, got %+v", done.Self)
	}
}

func countStates(states map[string]describe.StateNodeDescriptor) int {
	n := len(states)
	for _, s := range states {
		n += countStates(s.States)
	}
	return n
}

func TestLinks_EditorLinksFollowTheTemplate(t *testing.T) {
	s := demoStudio(t)
	src, _ := s.Sources("ticket")

	s.SetEditorURL("idea://open?file={path}&line={line}")
	if got := s.Links("ticket", src).Machine.Editor; !strings.HasPrefix(got, "idea://open?file=/") || !strings.Contains(got, "&line=") {
		t.Errorf("custom editor link = %q", got)
	}
	s.SetEditorURL("")
	if got := s.Links("ticket", src).Machine.Editor; got != "" {
		t.Errorf("editor links should be off, got %q", got)
	}

	gone := src
	moved := *src.Machine
	moved.Path = "/nowhere/workflows.go"
	gone.Machine = &moved
	s.SetEditorURL(core.DefaultEditorURL)
	if got := s.Links("ticket", gone).Machine.Editor; got != "" {
		t.Errorf("a file that is not on this host got an editor link %q", got)
	}
}

func TestLinks_Permalinks(t *testing.T) {
	s := demoStudio(t)
	src, _ := s.Sources("ticket")
	loc := *src.Machine
	loc.Path = "" // as on a host without the source
	src.Machine = &loc

	cases := []struct {
		build describe.SourceBuild
		file  string
		want  string
	}{
		{describe.SourceBuild{Module: "github.com/arisros/fate-studio", Revision: "abc123"}, demoFile,
			"https://github.com/arisros/fate-studio/blob/abc123/internal/demos/workflows.go#L"},
		{describe.SourceBuild{Module: "github.com/arisros/fate-studio", Version: "v0.9.0"}, demoFile,
			"https://github.com/arisros/fate-studio/blob/v0.9.0/internal/demos/workflows.go#L"},
		{describe.SourceBuild{Module: "github.com/acme/mono/services/orders/v2", Revision: "abc"}, "github.com/acme/mono/services/orders/v2/flow/machine.go",
			"https://github.com/acme/mono/blob/abc/services/orders/flow/machine.go#L"},
		{describe.SourceBuild{Module: "gitlab.com/acme/app", Revision: "abc"}, "gitlab.com/acme/app/flow/machine.go",
			"https://gitlab.com/acme/app/-/blob/abc/flow/machine.go#L"},
		{describe.SourceBuild{Module: "github.com/arisros/fate-studio", Version: "v0.9.1-0.20260101000000-abcdef123456"}, demoFile, ""},
		{describe.SourceBuild{Module: "github.com/other/module", Revision: "abc"}, demoFile, ""},
		{describe.SourceBuild{Module: "example.com/acme/app", Revision: "abc"}, "example.com/acme/app/machine.go", ""},
	}
	for _, c := range cases {
		build := c.build
		src.Build = &build
		loc.File = c.file
		got := s.Links("ticket", src).Machine.Permalink
		if c.want == "" && got != "" || c.want != "" && got != c.want+itoa(loc.Line) {
			t.Errorf("%+v, %s: permalink = %q, want %q", c.build, c.file, got, c.want)
		}
	}
}

func itoa(n int) string { return strconv.Itoa(n) }
