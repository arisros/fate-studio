package studio

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/arisros/fate-studio/core"
)

// ----- token / cookie -----

const sessionCookie = "fate_sid"

// tokenFor reads the session token from the cookie, minting + setting one when
// absent. Per-browser isolation: each token gets its own actor per machine.
// The cookie is scoped to basePath so a mounted studio does not put its cookie
// on every request the surrounding site makes.
func tokenFor(w http.ResponseWriter, r *http.Request, basePath string) string {
	if c, err := r.Cookie(sessionCookie); err == nil && c.Value != "" {
		return c.Value
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	tok := hex.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: tok, Path: basePath,
		HttpOnly: true, SameSite: http.SameSiteLaxMode,
		// Set only over TLS: a Secure cookie on a plain-HTTP dev server would
		// never be stored, breaking the local `go run ./cmd/fate-studio` flow.
		Secure: r.TLS != nil,
	})
	return tok
}

// ----- routing -----

func (s *Server) handleSimRoute(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/sim/")
	if rest == "" {
		http.NotFound(w, r)
		return
	}
	parts := strings.SplitN(rest, "/", 2)
	name := parts[0]
	sub := ""
	if len(parts) == 2 {
		sub = parts[1]
	}

	// ProxyURL: forward all sub-routes to the remote fate httphandler. The
	// cookie is forwarded transparently so the remote session model is preserved.
	if entry, ok := s.core.Lookup(name); ok && entry.ProxyURL != "" && sub != "" {
		base, err := url.Parse(entry.ProxyURL)
		if err != nil {
			http.Error(w, "bad proxy URL: "+err.Error(), http.StatusInternalServerError)
			return
		}
		proxy := httputil.NewSingleHostReverseProxy(base)
		proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
			http.Error(w, fmt.Sprintf("simulator for %q is unreachable: %v", name, err), http.StatusBadGateway)
		}
		proxy.ModifyResponse = func(resp *http.Response) error {
			scopeCookies(resp, s.basePath)
			return nil
		}
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/" + sub
		r2.URL.RawPath = ""
		r2.Host = base.Host
		proxy.ServeHTTP(w, r2)
		return
	}

	switch sub {
	case "":
		s.handleSimPage(w, r, name)
	case "stream":
		s.handleSimStream(w, r, name)
	case "send":
		s.handleSimSend(w, r, name)
	case "timer":
		s.handleSimTimer(w, r, name)
	case "invoke":
		s.handleSimInvoke(w, r, name)
	case "reset":
		s.handleSimReset(w, r, name)
	case "undo":
		s.handleSimUndo(w, r, name)
	case "import":
		s.handleSimImport(w, r, name)
	case "timeline":
		s.handleSimTimeline(w, r, name)
	case "export":
		s.handleSimExport(w, r, name)
	case "replay":
		s.handleSimReplay(w, r, name)
	default:
		http.NotFound(w, r)
	}
}

// sessionFor resolves (or creates) the per-browser session, minting the cookie
// when needed.
func (s *Server) sessionFor(w http.ResponseWriter, r *http.Request, name string) (*core.Session, error) {
	if _, ok := s.core.Lookup(name); !ok {
		return nil, fmt.Errorf("unknown machine %q", name)
	}
	return s.core.Session(name, tokenFor(w, r, s.basePath))
}

// writeSnapResponse returns the current frame — the same shape the SSE stream
// pushes, so a client has one contract to parse rather than two.
func writeSnapResponse(w http.ResponseWriter, sess *core.Session) {
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(sess.Frame())
}

// handleSimPage serves the SPA shell for /sim/{name}. The session cookie is
// minted lazily on the first /sim/{name}/stream or POST call (via sessionFor),
// so the page itself just hands off to the React app.
func (s *Server) handleSimPage(w http.ResponseWriter, r *http.Request, _ string) {
	s.handleSPA(w, r)
}

func (s *Server) handleSimStream(w http.ResponseWriter, r *http.Request, name string) {
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("content-type", "text/event-stream")
	w.Header().Set("cache-control", "no-cache")
	w.Header().Set("connection", "keep-alive")

	ch, initial, unsub := sess.Subscribe()
	defer unsub()
	if err := writeSSE(w, initial); err != nil {
		return
	}

	ctx := r.Context()
	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()
	for {
		select {
		case snap, open := <-ch:
			if !open {
				return
			}
			if err := writeSSE(w, snap); err != nil {
				return
			}
		case <-keepalive.C:
			sess.Touch()
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

func writeSSE(w io.Writer, frame core.Frame) error {
	b, err := json.Marshal(frame)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
		return err
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	return nil
}

func (s *Server) handleSimSend(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	_ = r.ParseForm()
	evtName := r.FormValue("event")
	if evtName == "" {
		http.Error(w, "missing 'event' field", http.StatusBadRequest)
		return
	}
	if err := sess.Send(r.Context(), evtName); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeSnapResponse(w, sess)
}

func (s *Server) handleSimTimer(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	_ = r.ParseForm()
	id := r.FormValue("id")
	if id == "" {
		http.Error(w, "missing 'id' field", http.StatusBadRequest)
		return
	}
	if err := sess.FireTimer(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeSnapResponse(w, sess)
}

func (s *Server) handleSimInvoke(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	_ = r.ParseForm()
	id := r.FormValue("id")
	if id == "" {
		http.Error(w, "missing 'id' field", http.StatusBadRequest)
		return
	}
	if r.FormValue("action") == "reject" {
		err = sess.Reject(id, r.FormValue("error"))
	} else {
		err = sess.Resolve(id, r.FormValue("output"))
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeSnapResponse(w, sess)
}

func (s *Server) handleSimReset(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if err := sess.Reset(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeSnapResponse(w, sess)
}

func (s *Server) handleSimUndo(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	ok, err := sess.Undo()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "nothing to undo", http.StatusBadRequest)
		return
	}
	writeSnapResponse(w, sess)
}

func (s *Server) handleSimImport(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "read body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := sess.Import(body); err != nil {
		http.Error(w, "import: "+err.Error(), http.StatusBadRequest)
		return
	}
	writeSnapResponse(w, sess)
}

func (s *Server) handleSimTimeline(w http.ResponseWriter, r *http.Request, name string) {
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"events": sess.Timeline()})
}

func (s *Server) handleSimExport(w http.ResponseWriter, r *http.Request, name string) {
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	b, err := sess.Export()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("content-type", "application/json")
	w.Header().Set("content-disposition", fmt.Sprintf(`attachment; filename="%s-snapshot.json"`, name))
	_, _ = w.Write(b)
}

// replayResult is the frame after a replay plus how far the replay got.
type replayResult struct {
	core.Frame
	Replay replayOutcome `json:"replay"`
}

type replayOutcome struct {
	Applied int    `json:"applied"`
	Total   int    `json:"total"`
	Error   string `json:"error,omitempty"`
}

// handleSimReplay starts the session over and applies the posted steps. A step
// the machine refuses is not an HTTP error: the reply says how many steps were
// applied and why the replay stopped.
func (s *Server) handleSimReplay(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	sess, err := s.sessionFor(w, r, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	var body struct {
		Steps []core.Step `json:"steps"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		http.Error(w, "replay: "+err.Error(), http.StatusBadRequest)
		return
	}
	out := replayOutcome{Total: len(body.Steps)}
	applied, err := sess.Replay(r.Context(), body.Steps)
	out.Applied = applied
	if err != nil {
		out.Error = err.Error()
	}
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(replayResult{Frame: sess.Frame(), Replay: out})
}

// scopeCookies narrows cookies set by a proxied simulator to the studio's
// mount prefix, so a mounted studio does not set them on the whole site.
func scopeCookies(resp *http.Response, basePath string) {
	cookies := resp.Cookies()
	if len(cookies) == 0 {
		return
	}
	resp.Header.Del("Set-Cookie")
	for _, c := range cookies {
		c.Path = basePath
		resp.Header.Add("Set-Cookie", c.String())
	}
}
