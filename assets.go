package studio

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"strings"
	"time"
)

// Embedded static assets served at /assets/*. These are the Vite/React build
// output (committed from ui/ via `make ui`): index.html plus content-hashed
// app-*.js and *-*.css. The studio is fully self-contained — no CDN at runtime.
//
//go:embed assets/*
var assetsFS embed.FS

// assetsSub roots the assets/ subtree so paths are clean
// ("/assets/app-x.js" → "app-x.js").
var assetsSub, _ = fs.Sub(assetsFS, "assets")

// handleAssets serves an embedded build asset. Filenames are content-hashed by
// Vite, so a given URL's bytes never change — safe to cache immutably.
func (s *Server) handleAssets(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/assets/")
	if name == "" || strings.Contains(name, "..") {
		http.NotFound(w, r)
		return
	}
	f, err := assetsSub.Open(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	switch {
	case strings.HasSuffix(name, ".js"):
		w.Header().Set("content-type", "application/javascript; charset=utf-8")
	case strings.HasSuffix(name, ".css"):
		w.Header().Set("content-type", "text/css; charset=utf-8")
	}
	w.Header().Set("cache-control", "public, max-age=31536000, immutable")

	if rs, ok := f.(io.ReadSeeker); ok {
		http.ServeContent(w, r, name, time.Time{}, rs)
		return
	}
	data, _ := fs.ReadFile(assetsSub, name)
	_, _ = w.Write(data)
}
