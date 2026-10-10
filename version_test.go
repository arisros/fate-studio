package studio

import (
	"encoding/json"
	"net/http/httptest"
	"runtime/debug"
	"testing"
)

func TestEngineVersionFrom(t *testing.T) {
	cases := []struct {
		name string
		deps []*debug.Module
		want string
	}{
		{"pinned", []*debug.Module{{Path: "example.com/x", Version: "v1.0.0"}, {Path: enginePath, Version: "v0.12.0"}}, "0.12.0"},
		{"replaced by a version", []*debug.Module{{Path: enginePath, Version: "v0.12.0", Replace: &debug.Module{Path: enginePath, Version: "v0.13.0"}}}, "0.13.0"},
		{"replaced by a directory", []*debug.Module{{Path: enginePath, Version: "v0.12.0", Replace: &debug.Module{Path: "../fate"}}}, "0.12.0"},
		{"absent", nil, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := engineVersionFrom(&debug.BuildInfo{Deps: tc.deps}); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestAPIVersion(t *testing.T) {
	rr := httptest.NewRecorder()
	NewServer("t").Handler().ServeHTTP(rr, httptest.NewRequest("GET", "/api/version", nil))
	if rr.Code != 200 {
		t.Fatalf("code %d", rr.Code)
	}
	var got versionInfo
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Studio != Version {
		t.Errorf("studio %q, want %q", got.Studio, Version)
	}
}
