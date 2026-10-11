package studio

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/arisros/fate-studio/core"
	"github.com/arisros/fate/describe"
	"github.com/arisros/fate/render"
)

// Server is an embeddable statechart studio. Construct with NewServer,
// register machines with Register, then ListenAndServe or mount Handler.
//
// The UI is a React + React Flow single-page app (source under ui/, built with
// Vite and committed to assets/). The server is a JSON/SSE API + SPA host:
// machine structure comes from /m/{name}/graph, live state over /sim/{name}/*.
type Server struct {
	title    string
	basePath string

	core *core.Studio

	shellOnce sync.Once
	shell     []byte
}

// NewServer returns an empty studio mounted at "/". title appears in the page
// header; use SetBasePath to mount it under a prefix.
func NewServer(title string) *Server {
	if title == "" {
		title = "fate studio"
	}
	return &Server{title: title, basePath: "/", core: core.New()}
}

// SetBasePath declares the URL prefix the studio is mounted at, so an embedded
// studio can live somewhere other than the site root:
//
//	srv.SetBasePath("/studio/")
//	http.Handle("/studio/", http.StripPrefix("/studio", srv.Handler()))
//
// The SPA loads its bundle and calls its API relative to this prefix. Call it
// before serving; the page shell is built once on the first request.
func (s *Server) SetBasePath(p string) *Server {
	s.basePath = normalizeBasePath(p)
	return s
}

// normalizeBasePath returns p with exactly one leading and trailing slash.
func normalizeBasePath(p string) string {
	p = strings.Trim(p, "/")
	if p == "" {
		return "/"
	}
	return "/" + p + "/"
}

// SetEditorURL sets the URL that opens a source file in an editor, with {path}
// and {line} placeholders. The default opens VS Code on the machine the browser
// runs on; set a remote form such as
// "vscode://vscode-remote/ssh-remote+host{path}:{line}" when the studio runs
// elsewhere, or "" to turn editor links off.
func (s *Server) SetEditorURL(template string) *Server {
	s.core.SetEditorURL(template)
	return s
}

// Core returns the studio behind the HTTP server: the registry and the
// simulation sessions, for a front end other than this one.
func (s *Server) Core() *core.Studio { return s.core }

// Register adds a machine. Build is required (static view); BuildLive is
// optional (interactive simulator). Returns the server for chaining.
func (s *Server) Register(e Entry) *Server {
	s.core.Register(e)
	return s
}

// Machines returns the names of all registered machines. Useful for iterating
// over all entries to apply configuration (e.g. reading proxy env vars).
func (s *Server) Machines() []string { return s.core.Machines() }

// SetProxyURL points a registered machine's simulator at a remote fate
// httphandler. Call it after LoadSnapshots. It reports false when no machine
// has that name.
func (s *Server) SetProxyURL(name, url string) bool { return s.core.SetProxyURL(name, url) }

// LoadSnapshots registers every <dir>/*.json file as a static (non-live)
// machine: a descriptor snapshot emitted by an implementation's
// `//go:generate` step (see fate/snapshot.Emit). It returns the number of
// machines registered; a malformed file is reported in the error while the
// valid ones are still registered.
func (s *Server) LoadSnapshots(dir string) (int, error) { return s.core.LoadSnapshots(dir) }

// Watch hot-reloads snapshot machines from the given dirs until ctx is
// cancelled, telling connected browsers to refetch a chart that changed. Call
// it in a goroutine.
func (s *Server) Watch(ctx context.Context, dirs ...string) { s.core.Watch(ctx, dirs...) }

// Handler returns an http.Handler with all studio routes mounted.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/machines", s.handleAPIMachines)
	mux.HandleFunc("/api/version", s.handleAPIVersion)
	mux.HandleFunc("/events", s.handleEvents)
	mux.HandleFunc("/m/", s.handleMachine)
	mux.HandleFunc("/sim/", s.handleSimRoute)
	mux.HandleFunc("/assets/", s.handleAssets)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "text/plain")
		_, _ = w.Write([]byte("ok"))
	})
	// Catch-all: serve the SPA shell for "/" and any client-routed deep link.
	mux.HandleFunc("/", s.handleSPA)
	return mux
}

// ListenAndServe runs the studio on addr. WriteTimeout is intentionally
// unset (0) so the simulator's SSE connections can stay open.
func (s *Server) ListenAndServe(addr string) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	return srv.ListenAndServe()
}

// handleMachine serves the machine's resolved graph and raw descriptor as JSON
// (consumed by the React Flow canvas). Any other /m/{name}... path returns the
// SPA shell so the client router can render the machine view.
func (s *Server) handleMachine(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/m/")
	if rest == "" {
		http.NotFound(w, r)
		return
	}
	parts := strings.SplitN(rest, "/", 3)
	name := parts[0]
	entry, ok := s.core.Lookup(name)
	if !ok {
		http.NotFound(w, r)
		return
	}

	if len(parts) >= 2 && parts[1] == "graph" {
		// Resolved node/edge graph for the studio canvas (laid out by elkjs in
		// the browser). Structure only — active highlight comes from SSE.
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(render.GraphJSON(entry.Build()))
		return
	}
	if len(parts) >= 2 && parts[1] == "sources" {
		s.handleSources(w, r, entry)
		return
	}
	if len(parts) >= 2 && parts[1] == "describe" {
		w.Header().Set("content-type", "application/json")
		b, _ := json.MarshalIndent(entry.Build(), "", "  ")
		_, _ = w.Write(b)
		return
	}

	// HTML view route (/m/{name}, /m/{name}/state/...): hand off to the SPA.
	s.handleSPA(w, r)
}

// handleSources serves the links from a machine's chart to its code. A machine
// simulated in process reports its own locations; a proxied one is asked over
// its fate httphandler. A machine with neither, such as a bare snapshot, has no
// links and answers with an empty object.
func (s *Server) handleSources(w http.ResponseWriter, r *http.Request, entry Entry) {
	w.Header().Set("content-type", "application/json")
	var src describe.MachineSources
	var ok bool
	if entry.ProxyURL != "" {
		src, ok = fetchSources(r.Context(), entry.ProxyURL)
	} else {
		src, ok = s.core.Sources(entry.Name)
	}
	if !ok {
		_, _ = w.Write([]byte("{}\n"))
		return
	}
	_ = json.NewEncoder(w).Encode(s.core.Links(entry.Name, src))
}

func fetchSources(ctx context.Context, base string) (describe.MachineSources, bool) {
	var src describe.MachineSources
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(base, "/")+"/sources", nil)
	if err != nil {
		return src, false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return src, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return src, false
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&src); err != nil {
		return src, false
	}
	return src, true
}
