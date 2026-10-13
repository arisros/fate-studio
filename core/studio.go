// Package core is the studio without a user interface: the machine registry,
// snapshot loading and watching, and simulation sessions. The HTTP server in
// the parent package is one front end over it; anything else that wants to
// list machines or drive a simulation can use it the same way.
package core

import (
	"fmt"
	"sync"

	"github.com/arisros/fate/describe"
)

// Entry is one registered machine. Build returns the static descriptor;
// BuildLive (optional) returns a fresh live actor for the simulator;
// ProxyURL (optional) forwards /sim/{name}/* to a remote fate httphandler.
// ProxyURL takes precedence over BuildLive when both are set.
type Entry struct {
	Name      string
	Summary   string
	Build     func() describe.MachineDescriptor
	BuildLive func() LiveInstance // nil = static-only, no local simulator
	ProxyURL  string              // remote fate httphandler base URL
}

// Studio holds the registered machines and their simulation sessions. It is
// safe for concurrent use.
type Studio struct {
	mu      sync.RWMutex
	entries []Entry

	sessions  *sessionStore
	changes   *hub
	editorURL string
}

// New returns an empty Studio.
func New() *Studio {
	return &Studio{sessions: newSessionStore(), changes: newHub(), editorURL: DefaultEditorURL}
}

// Register adds a machine.
func (s *Studio) Register(e Entry) {
	s.mu.Lock()
	s.entries = append(s.entries, e)
	s.mu.Unlock()
}

// replaceEntry inserts a snapshot entry, or updates the existing entry of the
// same name while keeping its ProxyURL. It refuses to replace an entry with a
// live simulator, so a snapshot cannot shadow a registered machine.
func (s *Studio) replaceEntry(e Entry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.entries {
		cur := &s.entries[i]
		if cur.Name != e.Name {
			continue
		}
		if cur.BuildLive != nil {
			return fmt.Errorf("%q is already registered with a live simulator", e.Name)
		}
		if e.ProxyURL == "" {
			e.ProxyURL = cur.ProxyURL
		}
		*cur = e
		return nil
	}
	s.entries = append(s.entries, e)
	return nil
}

// Lookup returns the machine registered under name.
func (s *Studio) Lookup(name string) (Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, e := range s.entries {
		if e.Name == name {
			return e, true
		}
	}
	return Entry{}, false
}

// Machines returns the names of all registered machines, in registration
// order.
func (s *Studio) Machines() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	names := make([]string, 0, len(s.entries))
	for _, e := range s.entries {
		names = append(names, e.Name)
	}
	return names
}

// Entries returns a copy of the registered machines, in registration order.
func (s *Studio) Entries() []Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Entry, len(s.entries))
	copy(out, s.entries)
	return out
}

// SetProxyURL points a registered machine's simulator at a remote fate
// httphandler. It reports false when no machine has that name.
func (s *Studio) SetProxyURL(name, url string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.entries {
		if s.entries[i].Name == name {
			s.entries[i].ProxyURL = url
			return true
		}
	}
	return false
}

// Session returns the simulation of machine that belongs to client, starting
// one on first use. client is any stable identifier of who is driving it, so
// two clients simulating the same machine do not disturb each other.
func (s *Studio) Session(machine, client string) (*Session, error) {
	entry, ok := s.Lookup(machine)
	if !ok {
		return nil, fmt.Errorf("unknown machine %q", machine)
	}
	return s.sessions.getOrCreate(machine+"|"+client, entry.BuildLive)
}

// Changes returns a channel that receives the name of each machine whose chart
// was reloaded, and a function that ends the subscription. A slow reader
// misses names instead of blocking the watcher.
func (s *Studio) Changes() (<-chan string, func()) {
	return s.changes.subscribe()
}

// Notify tells subscribers of Changes that the named machine's chart changed.
// The snapshot watcher calls it; an embedder that swaps a machine at runtime
// can call it too.
func (s *Studio) Notify(name string) { s.changes.publish(name) }

// hub fans machine names out to subscribers without ever blocking the sender.
type hub struct {
	mu   sync.Mutex
	subs map[chan string]struct{}
}

func newHub() *hub {
	return &hub{subs: map[chan string]struct{}{}}
}

func (h *hub) subscribe() (chan string, func()) {
	ch := make(chan string, 8)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		if _, ok := h.subs[ch]; ok {
			delete(h.subs, ch)
			close(ch)
		}
		h.mu.Unlock()
	}
}

func (h *hub) publish(name string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- name:
		default:
		}
	}
}
