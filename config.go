package studio

import (
	"encoding/json"
	"fmt"
	"os"
)

// Config is the optional JSON config for the standalone snapshot viewer
// (fate-studio --config studio.json). It's plain JSON so the studio stays
// dependency-free (no YAML). CLI flags override any field set here.
//
//	{
//	  "title": "LORA FSM Studio",
//	  "addr": ":8090",
//	  "snapshots": ["./.fate", "../other/.fate"],
//	  "watch": true,
//	  "proxyURLs": {"survey": "http://ltw:8083/fsm/survey"}
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
