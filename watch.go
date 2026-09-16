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

// Watch hot-reloads snapshot machines from the given dirs: it polls each dir's
// *.json files and, when a file's mtime+size changes, re-parses it and emits a
// graph-changed event so connected browsers refetch the chart. Polling (rather
// than fsnotify) keeps the studio dependency-free and sidesteps partial-write
// races — a half-written file simply fails to parse and is retried next tick.
//
// It runs until ctx is cancelled. Call it in a goroutine.
func (s *Server) Watch(ctx context.Context, dirs ...string) {
	type stamp struct {
		mod  time.Time
		size int64
	}
	seen := map[string]stamp{}

	tick := time.NewTicker(pollInterval)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
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
				cur := stamp{mod: fi.ModTime(), size: fi.Size()}
				prev, ok := seen[path]
				if ok && prev == cur {
					continue
				}
				seen[path] = cur
				if !ok {
					// First sighting (already loaded at startup) — record, don't reload.
					continue
				}
				if err := s.loadSnapshotFile(path); err != nil {
					log.Printf("watch: %v", err)
					continue
				}
				name := trimExt(filepath.Base(path))
				log.Printf("watch: reloaded %s", name)
				s.events.publish(name)
			}
		}
	}
}

func trimExt(base string) string {
	return base[:len(base)-len(filepath.Ext(base))]
}
