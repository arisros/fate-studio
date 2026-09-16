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
// fate httphandler serving that machine: config proxyURLs, or the environment
// variable FATE_PROXY_<NAME>, where NAME is the machine name upper-cased with
// every other character replaced by "_" (order-v2 reads FATE_PROXY_ORDER_V2).
// CLI flags override the config file. To simulate your own machines in
// process, embed the studio package and Register live entries.
//
// Configure the listen address with --addr or FATE_STUDIO_ADDR (default ":8090").
package main

import (
	"context"
	"flag"
	"log"
	"maps"
	"os"
	"slices"
	"strings"
	"unicode"

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

	flag.Visit(func(f *flag.Flag) {
		switch f.Name {
		case "title":
			cfg.Title = *title
		case "addr":
			cfg.Addr = *addr
		case "watch":
			cfg.Watch = *watch
		case "snapshots":
			cfg.Snapshots = splitDirs(*snapshots)
		}
	})

	// Resolve listen address: flag/config → env → default.
	if cfg.Addr == "" {
		cfg.Addr = os.Getenv("FATE_STUDIO_ADDR")
	}
	if cfg.Addr == "" {
		cfg.Addr = ":8090"
	}

	detected := false
	if len(cfg.Snapshots) == 0 {
		if fi, err := os.Stat(".fate"); err == nil && fi.IsDir() {
			cfg.Snapshots = []string{".fate"}
			detected = true
		}
	}
	if len(cfg.Snapshots) == 0 {
		*withDemos = true
	}

	if cfg.Title == "" {
		cfg.Title = "fate studio"
	}

	srv := studio.NewServer(cfg.Title)
	registerDemos := func() {
		for _, d := range demos.All() {
			srv.Register(d.Entry())
		}
		log.Printf("registered %d demo machine(s)", len(demos.All()))
	}
	if *withDemos {
		registerDemos()
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
		log.Printf("loaded %d machine(s) from %s", total, strings.Join(cfg.Snapshots, ", "))
		switch {
		case total > 0 || *withDemos:
		case detected:
			log.Printf("no snapshots in ./.fate, serving the demos")
			registerDemos()
		default:
			log.Fatalf("no machines loaded from %s", strings.Join(cfg.Snapshots, ", "))
		}
	}

	for _, name := range slices.Sorted(maps.Keys(cfg.ProxyURLs)) {
		setProxy(srv, name, cfg.ProxyURLs[name], "config")
	}
	for _, name := range srv.Machines() {
		key := proxyEnvKey(name)
		if url := os.Getenv(key); url != "" {
			setProxy(srv, name, url, key)
		}
	}

	switch {
	case !cfg.Watch:
	case len(cfg.Snapshots) == 0:
		log.Printf("watch: no snapshot dirs to watch")
	default:
		go srv.Watch(context.Background(), cfg.Snapshots...)
		log.Printf("watching %s for changes", strings.Join(cfg.Snapshots, ", "))
	}

	log.Printf("fate-studio listening on %s", cfg.Addr)
	if err := srv.ListenAndServe(cfg.Addr); err != nil {
		log.Fatalf("ListenAndServe: %v", err)
	}
}

func setProxy(srv *studio.Server, name, url, source string) {
	if !srv.SetProxyURL(name, url) {
		log.Printf("proxy (%s): no machine named %q", source, name)
		return
	}
	log.Printf("proxy (%s): %s -> %s", source, name, url)
}

// proxyEnvKey is FATE_PROXY_ plus the machine name upper-cased, with every
// character other than a letter or digit replaced by "_".
func proxyEnvKey(name string) string {
	return "FATE_PROXY_" + strings.Map(func(r rune) rune {
		if r < 128 && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
			return unicode.ToUpper(r)
		}
		return '_'
	}, name)
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
