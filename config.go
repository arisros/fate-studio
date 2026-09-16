package studio

import (
	"encoding/json"
	"fmt"
	"os"
)

// Config is the optional JSON config for the fate-studio binary
// (fate-studio --config studio.json). CLI flags override any field set here.
//
//	{
//	  "title": "orders studio",
//	  "addr": ":8090",
//	  "snapshots": ["./.fate", "../billing/.fate"],
//	  "watch": true,
//	  "proxyURLs": {"checkout": "http://localhost:8081/fsm/checkout"}
//	}
type Config struct {
	Title     string   `json:"title,omitempty"`
	Addr      string   `json:"addr,omitempty"`
	Snapshots []string `json:"snapshots,omitempty"`
	Watch     bool     `json:"watch,omitempty"`
	// ProxyURLs maps machine names to their remote fate httphandler base URLs.
	// When set, the live simulator for that machine forwards to the remote handler.
	ProxyURLs map[string]string `json:"proxyURLs,omitempty"`
}

// LoadConfig reads and parses a JSON config file.
func LoadConfig(path string) (Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("config: %w", err)
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return Config{}, fmt.Errorf("config %s: %w", path, err)
	}
	return c, nil
}
