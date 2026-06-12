package studio

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	sc "github.com/arisros/fate"
)

// Entry is one registered machine. Build returns the static descriptor;
// BuildLive (optional) returns a fresh live actor for the simulator;
// ProxyURL (optional) forwards /sim/{name}/* to a remote fate httphandler.
// ProxyURL takes precedence over BuildLive when both are set.
type Entry struct {
	Name      string
	Summary   string
	Build     func() sc.MachineDescriptor
	BuildLive func() LiveInstance // nil = static-only, no local simulator
	ProxyURL  string              // remote fate httphandler base URL
}

// Server is an embeddable statechart studio. Construct with NewServer,
// register machines with Register, then ListenAndServe or mount Handler.
//
// The UI is a React + React Flow single-page app (source under ui/, built with
// Vite and committed to assets/). The server is a JSON/SSE API + SPA host:
// machine structure comes from /m/{name}/graph, live state over /sim/{name}/*.
type Server struct {
	title string

	// entries is guarded by mu: Register and the snapshot hot-reloader mutate it
	// while request handlers read it concurrently.
	mu      sync.RWMutex
	entries []Entry

	// live sessions keyed by machine name (one shared session per machine).
	sessions *sessionStore

	// events broadcasts server-global SSE messages (e.g. graph-changed on
	// snapshot hot-reload) to the browser.
	events *eventHub
}

// NewServer returns an empty studio. title appears in the page header.
func NewServer(title string) *Server {
	if title == "" {
		title = "fate studio"
	}
	return &Server{title: title, sessions: newSessionStore(), events: newEventHub()}
}

// Register adds a machine. build is required (static view); buildLive is
// optional (interactive simulator). Returns the server for chaining.
func (s *Server) Register(e Entry) *Server {
	s.mu.Lock()
	s.entries = append(s.entries, e)
	s.mu.Unlock()
	return s
}

// replaceEntry inserts e, replacing any existing entry with the same name (used
// by the snapshot hot-reloader). Returns true if an existing entry was updated.
func (s *Server) replaceEntry(e Entry) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.entries {
		if s.entries[i].Name == e.Name {
			s.entries[i] = e
			return true
		}
	}
	s.entries = append(s.entries, e)
	return false
}

func (s *Server) lookup(name string) (Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, e := range s.entries {
		if e.Name == name {
			return e, true
		}
	}
	return Entry{}, false
}

// Machines returns the names of all registered machines. Useful for iterating
// over all entries to apply configuration (e.g. reading proxy env vars).
func (s *Server) Machines() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	names := make([]string, 0, len(s.entries))
	for _, e := range s.entries {
		names = append(names, e.Name)
	}
	return names
}

// SetProxyURL updates the ProxyURL for a registered machine. It is a no-op if
// url is empty or the machine name is not registered. Call after LoadSnapshots
// to configure live simulation via a remote fate httphandler.
func (s *Server) SetProxyURL(name, url string) {
	if url == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.entries {
		if s.entries[i].Name == name {
			s.entries[i].ProxyURL = url
			return
		}
	}
}

// entryList returns a snapshot copy of the registered entries under the read
// lock — safe to range over without holding the lock.
func (s *Server) entryList() []Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Entry, len(s.entries))
	copy(out, s.entries)
	return out
}

// Handler returns an http.Handler with all studio routes mounted.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/machines", s.handleAPIMachines)
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
	entry, ok := s.lookup(name)
	if !ok {
		http.NotFound(w, r)
		return
	}

	if len(parts) >= 2 && parts[1] == "graph" {
		// Resolved node/edge graph for the studio canvas (laid out by elkjs in
		// the browser). Structure only — active highlight comes from SSE.
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(sc.RenderGraphJSON(entry.Build()))
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
