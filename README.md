# fate-studio

A self-hosted studio for [fate](https://github.com/arisros/fate) statecharts: a
chart viewer and a live simulator you drive in the browser.

Open a machine to see its diagram, then step through it: send events, fire
delayed transitions, resolve or reject invocations, and watch the active state
update in real time over Server-Sent Events. Snapshots inspect, diff, import, and
export; a timeline records each step; the canvas lays itself out with elkjs.

It is a separate project from the engine on purpose. The engine has no
dependencies; the studio needs a web server. Keeping them apart means
`go get github.com/arisros/fate` never pulls in `net/http` or anything else.

A hosted instance runs at
[fate-studio.arisjirat.com](https://fate-studio.arisjirat.com). The engine's own
documentation is at [fate.arisjirat.com](https://fate.arisjirat.com).

## Run the demo server

```sh
go run ./cmd/fate-studio
# then open http://localhost:8090
```

With no `./.fate` directory, the binary serves the built-in demos. Other modes:

```sh
go run ./cmd/fate-studio --snapshots testdata/snapshots --watch   # descriptor snapshots, hot-reloaded
go run ./cmd/fate-studio --demos --snapshots ./.fate              # both
go run ./cmd/fate-studio --config studio.json                     # see Config in config.go
```

A snapshot is a `MachineDescriptor` as JSON (what `fate/snapshot.Emit` writes). It
renders as a chart with no runtime behind it. To simulate it, point the machine at
a fate `httphandler` with `proxyURLs` in the config or the `FATE_PROXY_<NAME>`
environment variable, where `NAME` is the machine name upper-cased with every
other character replaced by `_` (`order-v2` reads `FATE_PROXY_ORDER_V2`). Flags
override the config file. A snapshot never replaces a live machine of the same
name.

Or with Docker:

```sh
docker build -t fate-studio .
docker run --rm -p 8090:8090 fate-studio
```

The address is configurable with `--addr` or `FATE_STUDIO_ADDR` (default `:8090`).

## Demos

The demos in `internal/demos` are the reference for every studio feature, and the
UI tests run against fixtures generated from them.

| Demo | Feature |
|---|---|
| `traffic-light`, `pipeline` | transitions, final states |
| `media-player` | parallel regions advancing together |
| `editor` | deep history |
| `counter` | live context |
| `timeout` | delayed transitions |
| `fetch` | invocations |
| `order` | parallel lanes, self-loops, layout, one view model per lane |
| `ticket` | global events (badged, not drawn), named and gated guards, guarded branches in the virtual sim, a view model in review |

After changing a demo, run `make fixtures` to regenerate `testdata/snapshots` and
`ui/src/graph/__fixtures__`; `go test` fails while they are stale.

## Embed it in your own program

The studio is an `http.Handler`. Register your machines and mount it:

```go
import "github.com/arisros/fate-studio"

srv := studio.NewServer("my app")
srv.SetBasePath("/studio/") // the prefix you mount at; omit when serving at "/"
srv.Register(studio.Entry{
    Name:    "checkout",
    Summary: "the checkout flow",
    Build:   checkoutMachine().Describe,
    BuildLive: func() studio.LiveInstance {
        return studio.NewLiveActor(checkoutMachine(), dispatch, checkoutMachine().Describe)
    },
})

http.Handle("/studio/", http.StripPrefix("/studio", srv.Handler()))
```

Mounting under a prefix needs `srv.SetBasePath("/studio/")` before serving, so
the page loads its bundle and calls its API under that prefix instead of the
site root. Serving at the root needs no call.

`dispatch` maps an event name from the UI to one of your typed events. A machine
registered with only `Build` (no `BuildLive`) shows its static diagram without
the live simulator.

## Design

The UI follows a small design language captured in [DESIGN.md](DESIGN.md), a
violet-midnight palette with an electric-lime accent. The UI is a Vite + React
app under `ui/`; `make ui` builds it into `assets/`, which is committed and
embedded, so the Go build needs no Node toolchain and makes no external request.

## Tests

```sh
make test                  # Go
cd ui && npm test          # UI unit tests
cd ui && npx playwright test   # renders every demo, at / and mounted under /studio/
```

## License

[MIT](LICENSE) © Aris Kurniawan
