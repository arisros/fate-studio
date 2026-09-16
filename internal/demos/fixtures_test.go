package demos_test

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/arisros/fate/render"

	"github.com/arisros/fate-studio/internal/demos"
)

var update = flag.Bool("update", false, "rewrite the generated fixtures")

// TestFixtures keeps the committed demo snapshots and UI graph fixtures in sync
// with the demo machines. Regenerate with `make fixtures`.
func TestFixtures(t *testing.T) {
	root := filepath.Join("..", "..")
	for _, d := range demos.All() {
		desc := d.Descriptor()
		check(t, filepath.Join(root, "testdata", "snapshots", d.Name+".json"), desc)
		check(t, filepath.Join(root, "ui", "src", "graph", "__fixtures__", d.Name+".graph.json"), render.GraphJSON(desc))
	}
}

func check(t *testing.T, path string, v any) {
	t.Helper()
	want, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	want = append(want, '\n')
	if *update {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, want, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%s: %v (run make fixtures)", path, err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("%s is stale (run make fixtures)", path)
	}
}

func TestDispatchRejectsUndeclaredEvents(t *testing.T) {
	for _, d := range demos.All() {
		live := d.Entry().BuildLive()
		if err := live.Start(t.Context()); err != nil {
			t.Fatalf("%s: %v", d.Name, err)
		}
		if err := live.SendEvent(t.Context(), "NOT_AN_EVENT"); err == nil {
			t.Errorf("%s accepted an undeclared event", d.Name)
		}
	}
}
