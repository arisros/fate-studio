// fate-studio — a self-hosted, engine-agnostic statechart studio.
//
// It renders machine descriptor snapshots (.fate/*.json, emitted by an
// implementation's `//go:generate` via fate/snapshot.Emit) as interactive
// charts, with optional hot-reload. Because it reads neutral descriptor JSON,
// it needs neither the implementation's source nor a running instance.
//
// Usage:
//
//	fate-studio --snapshots ./.fate            # render snapshots in ./.fate
//	fate-studio --snapshots ./.fate --watch    # + hot-reload on rebuild
//	fate-studio --config studio.json           # configure via JSON
//	fate-studio                                 # defaults to ./.fate if present
//
// For the LIVE simulator (drive a machine: send events, fire timers, resolve
// invocations), embed the studio package in your own binary and Register live
// entries — see services/fate-example for the reference.
//
// Configure the listen address with --addr or FATE_STUDIO_ADDR (default ":8090").
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"strings"

	studio "github.com/arisros/fate-studio"
)

func main() {
	var (
		addr      = flag.String("addr", "", "listen address (default $FATE_STUDIO_ADDR or :8090)")
		snapshots = flag.String("snapshots", "", "comma-separated dirs of .fate/*.json snapshots")
		watch     = flag.Bool("watch", false, "hot-reload snapshots when files change")
		title     = flag.String("title", "", "studio title shown in the header")
		configPth = flag.String("config", "", "path to a JSON config file")
	)
	flag.Parse()

	cfg := studio.Config{}
	if *configPth != "" {
		c, err := studio.LoadConfig(*configPth)
		if err != nil {
			log.Fatal(err)
		}
		cfg = c
	}

	// CLI flags override config fields.
	if *title != "" {
		cfg.Title = *title
	}
	if *addr != "" {
		cfg.Addr = *addr
	}
	if *watch {
		cfg.Watch = true
	}
	if *snapshots != "" {
		cfg.Snapshots = append(cfg.Snapshots, splitDirs(*snapshots)...)
	}

	// Resolve listen address: flag/config → env → default.
	if cfg.Addr == "" {
		cfg.Addr = os.Getenv("FATE_STUDIO_ADDR")
	}
	if cfg.Addr == "" {
		cfg.Addr = ":8090"
	}

	// Default to ./.fate when no source is configured and it exists.
	if len(cfg.Snapshots) == 0 {
		if fi, err := os.Stat(".fate"); err == nil && fi.IsDir() {
			cfg.Snapshots = []string{".fate"}
		}
	}
	if len(cfg.Snapshots) == 0 {
		log.Fatal("no snapshots configured: pass --snapshots <dir> (or create ./.fate)")
	}

	if cfg.Title == "" {
		cfg.Title = "fate studio"
	}

	srv := studio.NewServer(cfg.Title)
	total := 0
	for _, dir := range cfg.Snapshots {
		n, err := srv.LoadSnapshots(dir)
		if err != nil {
			log.Printf("warning: %v", err)
		}
		total += n
	}
	if total == 0 {
		log.Fatalf("no machines loaded from %s", strings.Join(cfg.Snapshots, ", "))
	}
	log.Printf("loaded %d machine(s) from %s", total, strings.Join(cfg.Snapshots, ", "))

	if cfg.Watch {
		go srv.Watch(context.Background(), cfg.Snapshots...)
		log.Printf("watching %s for changes", strings.Join(cfg.Snapshots, ", "))
	}

	log.Printf("fate-studio listening on %s", cfg.Addr)
	if err := srv.ListenAndServe(cfg.Addr); err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}

func splitDirs(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
