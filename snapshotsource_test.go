package studio

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// a minimal descriptor JSON, exactly the shape fate/snapshot.Emit writes.
const tlDescriptor = `{
  "id": "traffic-light",
  "initial": "red",
  "states": {
    "red":    {"type": "atomic", "on": {"TIMER": [{"target": "green"}]}},
    "green":  {"type": "atomic", "on": {"TIMER": [{"target": "yellow"}]}},
    "yellow": {"type": "atomic", "on": {"TIMER": [{"target": "red"}]}}
  }
}`

func writeSnap(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name+".json"), []byte(body), 0o644); err != nil {
		t.Fatalf("write snapshot: %v", err)
	}
}

func TestLoadSnapshots_RegistersStaticMachine(t *testing.T) {
	dir := t.TempDir()
	writeSnap(t, dir, "traffic-light", tlDescriptor)

	s := NewServer("test")
	n, err := s.LoadSnapshots(dir)
	if err != nil {
		t.Fatalf("LoadSnapshots: %v", err)
	}
	if n != 1 {
		t.Fatalf("registered %d machines, want 1", n)
	}

	// Appears in /api/machines as static (Live=false).
	rr := httptest.NewRecorder()
	s.handleAPIMachines(rr, httptest.NewRequest(http.MethodGet, "/api/machines", nil))
	var infos []machineInfo
	if err := json.Unmarshal(rr.Body.Bytes(), &infos); err != nil {
		t.Fatalf("decode machines: %v", err)
	}
	if len(infos) != 1 || infos[0].Name != "traffic-light" || infos[0].Live {
		t.Fatalf("unexpected machines: %+v", infos)
	}

	// /m/{name}/graph renders a non-empty graph from the descriptor alone.
	rr = httptest.NewRecorder()
	s.handleMachine(rr, httptest.NewRequest(http.MethodGet, "/m/traffic-light/graph", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("graph status %d", rr.Code)
	}
	var g struct {
		Nodes []json.RawMessage `json:"nodes"`
		Edges []json.RawMessage `json:"edges"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &g); err != nil {
		t.Fatalf("decode graph: %v", err)
	}
	if len(g.Nodes) != 3 || len(g.Edges) != 3 {
		t.Fatalf("graph has %d nodes, %d edges; want 3/3", len(g.Nodes), len(g.Edges))
	}
}

// A malformed file is skipped (error returned) while valid files still register,
// so a half-written file during hot-reload never takes down the studio.
func TestLoadSnapshots_SkipsMalformed(t *testing.T) {
	dir := t.TempDir()
	writeSnap(t, dir, "good", tlDescriptor)
	writeSnap(t, dir, "bad", "{ not json")

	s := NewServer("test")
	n, err := s.LoadSnapshots(dir)
	if err == nil {
		t.Fatal("expected error for malformed file")
	}
	if n != 1 {
		t.Fatalf("registered %d, want 1 (good only)", n)
	}
}

func TestLoadSnapshotFile_KeepsLastGoodOnParseError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.json")
	if err := os.WriteFile(path, []byte(tlDescriptor), 0o644); err != nil {
		t.Fatal(err)
	}
	s := NewServer("test")
	if err := s.loadSnapshotFile(path); err != nil {
		t.Fatalf("initial load: %v", err)
	}
	// Corrupt the file (simulating a partial write) and reload — should error
	// and leave the existing entry intact.
	if err := os.WriteFile(path, []byte("{bad"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := s.loadSnapshotFile(path); err == nil {
		t.Fatal("expected parse error")
	}
	if _, ok := s.lookup("m"); !ok {
		t.Fatal("entry was lost after a failed reload")
	}
}
