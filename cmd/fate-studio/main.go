// fate-studio serves fate statecharts in the browser.
//
// It renders machine descriptor snapshots (.fate/*.json, emitted with
// fate/snapshot.Emit) as charts, with optional hot-reload, and it ships a set of
// live demo machines that cover every studio feature.
//
// Usage:
//
//	fate-studio                                 # ./.fate if present, else the demos
//	fate-studio --demos                         # the live demos
//	fate-studio --snapshots ./.fate --watch     # snapshots, reloaded on change
//	fate-studio --config studio.json            # configure via JSON
//
// A snapshot has no runtime behind it. To simulate one, set a proxy URL to a
// fate httphandler serving that machine (config proxyURLs, or the
// FATE_PROXY_<NAME> environment variable). To simulate your own machines in
// process, embed the studio package and Register live entries.
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
	"github.com/arisros/fate-studio/internal/demos"
)

func main() {
	var (
		addr      = flag.String("addr", "", "listen address (default $FATE_STUDIO_ADDR or :8090)")
		snapshots = flag.String("snapshots", "", "comma-separated dirs of .fate/*.json snapshots")
		watch     = flag.Bool("watch", false, "hot-reload snapshots when files change")
		title     = flag.String("title", "", "studio title shown in the header")
		configPth = flag.String("config", "", "path to a JSON config file")
		withDemos = flag.Bool("demos", false, "serve the built-in live demo machines")
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
		*withDemos = true
	}

	if cfg.Title == "" {
		cfg.Title = "fate studio"
	}

	srv := studio.NewServer(cfg.Title)
	if *withDemos {
		for _, d := range demos.All() {
			srv.Register(d.Entry())
		}
		log.Printf("registered %d demo machine(s)", len(demos.All()))
	}
	if len(cfg.Snapshots) > 0 {
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
	}

	// Apply ProxyURLs: config file first, then FATE_PROXY_<NAME> env vars override.
	for name, url := range cfg.ProxyURLs {
		srv.SetProxyURL(name, url)
		log.Printf("proxy: %s → %s", name, url)
	}
	for _, e := range srv.Machines() {
		envKey := "FATE_PROXY_" + strings.ToUpper(strings.ReplaceAll(e, "-", "_"))
		if url := os.Getenv(envKey); url != "" {
			srv.SetProxyURL(e, url)
			log.Printf("proxy (env %s): %s → %s", envKey, e, url)
		}
	}

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
