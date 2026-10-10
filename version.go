package studio

import (
	"encoding/json"
	"net/http"
	"runtime/debug"
	"strings"
)

// Version is the fate-studio release this code belongs to. Release automation
// updates it.
const Version = "0.8.0" // x-release-please-version

const enginePath = "github.com/arisros/fate"

// EngineVersion returns the version of the fate engine compiled into the
// binary, or "" when the build carries no module information.
func EngineVersion() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	return engineVersionFrom(info)
}

func engineVersionFrom(info *debug.BuildInfo) string {
	for _, dep := range info.Deps {
		if dep.Path != enginePath {
			continue
		}
		if dep.Replace != nil && dep.Replace.Version != "" {
			dep = dep.Replace
		}
		return strings.TrimPrefix(dep.Version, "v")
	}
	return ""
}

// versionInfo is the JSON shape returned by GET /api/version.
type versionInfo struct {
	Studio string `json:"studio"`
	Engine string `json:"engine,omitempty"`
}

func (s *Server) handleAPIVersion(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("content-type", "application/json")
	_ = json.NewEncoder(w).Encode(versionInfo{Studio: Version, Engine: EngineVersion()})
}
