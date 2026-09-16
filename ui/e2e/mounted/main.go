// Command mounted serves the demo studio under /studio/, for the e2e suite.
package main

import (
	"flag"
	"log"
	"net/http"

	studio "github.com/arisros/fate-studio"
	"github.com/arisros/fate-studio/internal/demos"
)

func main() {
	addr := flag.String("addr", ":8198", "listen address")
	flag.Parse()

	srv := studio.NewServer("fate studio (mounted)").SetBasePath("/studio/")
	for _, d := range demos.All() {
		srv.Register(d.Entry())
	}
	mux := http.NewServeMux()
	mux.Handle("/studio/", http.StripPrefix("/studio", srv.Handler()))
	log.Fatal(http.ListenAndServe(*addr, mux))
}
