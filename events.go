package studio

import (
	"fmt"
	"io"
	"net/http"
	"time"
)

// handleEvents is the GET /events SSE endpoint. Each message is emitted as a
// "graph-changed" event whose data is the affected machine name, so the browser
// can refetch /m/{name}/graph and re-layout without a full reload.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("content-type", "text/event-stream")
	w.Header().Set("cache-control", "no-cache")
	w.Header().Set("connection", "keep-alive")

	ch, unsub := s.core.Changes()
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
