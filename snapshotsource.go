package studio

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	sc "github.com/arisros/fate"
)

// LoadSnapshots registers every <dir>/*.json file as a static (non-live) machine
// — a descriptor snapshot emitted by an implementation's `//go:generate` step
// (see fate/snapshot.Emit). The studio renders the chart from the descriptor
// alone, with no engine runtime and no access to the implementation.
//
// Returns the number of machines registered. A malformed file is skipped with a
// returned error wrapping all failures, but valid files are still registered.
func (s *Server) LoadSnapshots(dir string) (int, error) {
	matches, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return 0, fmt.Errorf("glob %s: %w", dir, err)
	}
	sort.Strings(matches)
	var n int
	var errs []string
	for _, path := range matches {
		if err := s.loadSnapshotFile(path); err != nil {
			errs = append(errs, err.Error())
			continue
		}
		n++
	}
	if len(errs) > 0 {
		return n, fmt.Errorf("snapshot load: %s", strings.Join(errs, "; "))
	}
	return n, nil
}

// loadSnapshotFile parses one descriptor file and registers/updates its entry.
// The machine name is the file's base name without extension. On a parse error
// the previously registered entry (if any) is left untouched, so a hot-reload
// that catches a half-written file never blanks a working chart.
func (s *Server) loadSnapshotFile(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	d, err := sc.LoadDescriptor(b)
	if err != nil {
		return fmt.Errorf("parse %s: %w", filepath.Base(path), err)
	}
	name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	summary := "Snapshot of " + d.ID
	s.replaceEntry(Entry{
		Name:    name,
		Summary: summary,
		Build:   func() sc.MachineDescriptor { return d },
		// BuildLive nil → static-only; the simulator is unavailable for snapshots.
	})
	return nil
}
