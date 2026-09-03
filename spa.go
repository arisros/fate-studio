package studio

import (
	"encoding/json"
	"html"
	"io/fs"
	"net/http"
	"regexp"
	"strings"
)

// baseTag matches the <base> element in the built shell, which the server
// rewrites to the studio's mount prefix on first use.
var baseTag = regexp.MustCompile(`(?i)<base\s[^>]*>`)

// handleSPA serves the embedded single-page-app shell (index.html, produced by
// the Vite/React build under ui/ and committed to assets/). The React Router
// owns "/", "/m/:name" and "/sim/:name" on the client, so this same shell is
// returned for every non-API, non-asset GET route — deep links included.
func (s *Server) handleSPA(w http.ResponseWriter, _ *http.Request) {
	b := s.spaShell()
	if b == nil {
		http.Error(w, "studio UI not built (run `make ui`)", http.StatusInternalServerError)
		return
	}
	w.Header().Set("content-type", "text/html; charset=utf-8")
	w.Header().Set("cache-control", "no-cache")
	_, _ = w.Write(b)
}

// spaShell returns index.html with a <base> element injected, built once.
//
// Everything the page requests — its bundle, the JSON API, the SSE stream — is
// written as a relative URL, so it all resolves against this one element. That
// is what lets the same shell serve "/" and a deep link like "/m/checkout"
// while the studio is mounted under an arbitrary prefix. Returns nil if the UI
// has not been built.
func (s *Server) spaShell() []byte {
	s.shellOnce.Do(func() {
		b, err := fs.ReadFile(assetsSub, "index.html")
		if err != nil {
			return
		}
		// Vite can only emit absolute asset paths, so retarget them; then point
		// <base> at the same prefix for everything written relative.
		if s.basePath != "/" {
			b = []byte(strings.ReplaceAll(string(b), `"/assets/`, `"`+s.basePath+`assets/`))
		}
		tag := `<base href="` + html.EscapeString(s.basePath) + `">`
		if baseTag.Match(b) {
			s.shell = baseTag.ReplaceAll(b, []byte(tag))
			return
		}
		// No <base> in the built shell (an older assets/ build): insert one.
		if i := strings.Index(string(b), "<head>"); i >= 0 {
			j := i + len("<head>")
			s.shell = []byte(string(b[:j]) + "\n    " + tag + string(b[j:]))
			return
		}
		s.shell = b
	})
	return s.shell
}

// machineInfo is the JSON shape returned by GET /api/machines — the data the
// React index view renders as machine cards.
type machineInfo struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
	Live    bool   `json:"live"`
}

func (s *Server) handleAPIMachines(w http.ResponseWriter, _ *http.Request) {
	out := make([]machineInfo, 0, len(s.entries))
	for _, e := range s.entries {
		out = append(out, machineInfo{Name: e.Name, Summary: e.Summary, Live: e.BuildLive != nil})
	}
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
