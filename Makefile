.PHONY: ui build test vet lint run fixtures

# Build the React Flow UI (Vite) into ./assets, which is embedded by go:embed.
# Commit the ./assets output so the Go build/release stays node-free + hermetic.
ui:
	cd ui && npm ci && npm run build

build:
	GOFLAGS=-mod=vendor go build ./...

test:
	GOFLAGS=-mod=vendor go test -race ./...

vet:
	GOFLAGS=-mod=vendor go vet ./...

run:
	GOFLAGS=-mod=vendor go run ./cmd/fate-studio

# Regenerate testdata/snapshots and the UI graph fixtures from the demos.
fixtures:
	GOFLAGS=-mod=vendor go test ./internal/demos -run TestFixtures -update
