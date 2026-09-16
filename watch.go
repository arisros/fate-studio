package studio

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"
)

// pollInterval is how often the snapshot watcher re-stats the watched dirs.
// Snapshot files change only on rebuild, so a relaxed cadence is plenty and
// keeps the watcher cheap.
const pollInterval = 500 * time.Millisecond

// Watch hot-reloads snapshot machines from the given dirs. It polls each dir's
// *.json files and loads any file that is new or whose mtime or size changed
// since the call began, then emits graph-changed so connected browsers refetch
// the chart. Polling keeps the studio dependency-free; a half-written file
// fails to parse, keeps the last good chart, and loads once its write finishes
// and changes the stamp again.
//
// It runs until ctx is cancelled. Call it in a goroutine.
func (s *Server) Watch(ctx context.Context, dirs ...string) {
	seen := map[string]fileStamp{}
	s.scanSnapshots(dirs, seen, false)

	tick := time.NewTicker(pollInterval)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			s.scanSnapshots(dirs, seen, true)
		}
	}
}

type fileStamp struct {
	mod  time.Time
	size int64
}

// scanSnapshots records every snapshot's stamp in seen and, when reload is
// set, loads the ones that are new or changed.
func (s *Server) scanSnapshots(dirs []string, seen map[string]fileStamp, reload bool) {
	for _, dir := range dirs {
		matches, err := filepath.Glob(filepath.Join(dir, "*.json"))
		if err != nil {
			continue
		}
		for _, path := range matches {
			fi, err := os.Stat(path)
			if err != nil {
				continue
			}
			cur := fileStamp{mod: fi.ModTime(), size: fi.Size()}
			if prev, ok := seen[path]; ok && prev == cur {
				continue
			}
			seen[path] = cur
			if !reload {
				continue
			}
			if err := s.loadSnapshotFile(path); err != nil {
				log.Printf("watch: %v", err)
				continue
			}
			name := trimExt(filepath.Base(path))
			log.Printf("watch: loaded %s", name)
			s.events.publish(name)
		}
	}
}

func trimExt(base string) string {
	return base[:len(base)-len(filepath.Ext(base))]
}
