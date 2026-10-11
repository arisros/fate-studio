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
//	  "proxyURLs": {"checkout": "http://localhost:8081/fsm/checkout"},
//	  "editorURL": "vscode://file{path}:{line}"
//	}
type Config struct {
	Title     string   `json:"title,omitempty"`
	Addr      string   `json:"addr,omitempty"`
	Snapshots []string `json:"snapshots,omitempty"`
	Watch     bool     `json:"watch,omitempty"`
	// ProxyURLs maps machine names to their remote fate httphandler base URLs.
	// When set, the live simulator for that machine forwards to the remote handler.
	ProxyURLs map[string]string `json:"proxyURLs,omitempty"`
	// EditorURL is the URL that opens a source file in an editor, with {path}
	// and {line} placeholders. Nil keeps the default (VS Code); an empty string
	// turns editor links off.
	EditorURL *string `json:"editorURL,omitempty"`
	// EditorCommand is a command the studio runs to open a source file, with
	// {path} and {line} placeholders, for an editor with no URL scheme. When
	// set it takes the place of EditorURL.
	EditorCommand string `json:"editorCommand,omitempty"`
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
