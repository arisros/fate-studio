package studio

import (
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// eventHub is a tiny server-global SSE broadcaster. It carries control messages
// to the browser that are not tied to a simulation session — currently just
// "graph-changed" emitted when a watched snapshot file is hot-reloaded.
//
// Sends are non-blocking (drop-on-full) so a slow/stuck client can never block
// the watcher goroutine, mirroring the per-session subscribe() pattern.
type eventHub struct {
	mu   sync.Mutex
	subs map[chan string]struct{}
}

func newEventHub() *eventHub {
	return &eventHub{subs: map[chan string]struct{}{}}
}

func (h *eventHub) subscribe() (chan string, func()) {
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

// publish fans msg out to all subscribers, skipping any whose buffer is full.
func (h *eventHub) publish(msg string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- msg:
		default:
		}
	}
}

// handleEvents is the GET /events SSE endpoint. Each message is emitted as a
// "graph-changed" event whose data is the affected machine name, so the browser
// can refetch /m/{name}/graph and re-layout without a full reload.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("content-type", "text/event-stream")
	w.Header().Set("cache-control", "no-cache")
	w.Header().Set("connection", "keep-alive")

	ch, unsub := s.events.subscribe()
	defer unsub()

	// Prime the stream so the client's EventSource opens immediately.
	_, _ = io.WriteString(w, ": connected\n\n")
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	ctx := r.Context()
	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()
	for {
		select {
		case name, open := <-ch:
			if !open {
				return
			}
			if _, err := fmt.Fprintf(w, "event: graph-changed\ndata: %s\n\n", name); err != nil {
				return
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		case <-keepalive.C:
			if _, err := io.WriteString(w, ": keepalive\n\n"); err != nil {
				return
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		case <-ctx.Done():
			return
		}
	}
}
