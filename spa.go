package studio

import (
	"encoding/json"
	"io/fs"
	"net/http"
)

// handleSPA serves the embedded single-page-app shell (index.html, produced by
// the Vite/React build under ui/ and committed to assets/). The React Router
// owns "/", "/m/:name" and "/sim/:name" on the client, so this same shell is
// returned for every non-API, non-asset GET route — deep links included.
func (s *Server) handleSPA(w http.ResponseWriter, _ *http.Request) {
	b, err := fs.ReadFile(assetsSub, "index.html")
	if err != nil {
		http.Error(w, "studio UI not built (run `make ui`)", http.StatusInternalServerError)
		return
	}
	w.Header().Set("content-type", "text/html; charset=utf-8")
	w.Header().Set("cache-control", "no-cache")
	_, _ = w.Write(b)
}

// machineInfo is the JSON shape returned by GET /api/machines — the data the
// React index view renders as machine cards.
type machineInfo struct {
	Name    string `json:"name"`
	Summary string `json:"summary"`
	Live    bool   `json:"live"`
}

func (s *Server) handleAPIMachines(w http.ResponseWriter, _ *http.Request) {
	entries := s.entryList()
	out := make([]machineInfo, 0, len(entries))
	for _, e := range entries {
		out = append(out, machineInfo{Name: e.Name, Summary: e.Summary, Live: e.BuildLive != nil || e.ProxyURL != ""})
	}
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
