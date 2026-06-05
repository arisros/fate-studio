# fate-studio

A self-hosted studio for [fate](https://github.com/arisros/fate) statecharts: a
chart viewer and a live simulator you drive in the browser.

Open a machine to see its diagram, then step through it — send events, fire
delayed transitions, resolve or reject invocations — and watch the active state
update in real time over Server-Sent Events. Snapshots inspect, diff, import, and
export; a timeline records each step; the canvas lays itself out with elkjs.

It is a separate project from the engine on purpose. The engine has no
dependencies; the studio needs a web server. Keeping them apart means
`go get github.com/arisros/fate` never pulls in `net/http` or anything else.

## Run the demo server

```sh
go run ./cmd/fate-studio
# then open http://localhost:8090
```

Or with Docker:

```sh
docker build -t fate-studio .
docker run --rm -p 8090:8090 fate-studio
```

The address is configurable with `FATE_STUDIO_ADDR` (default `:8090`). The server
ships a set of demo machines — a traffic light, parallel media player, a build
pipeline, a deep-history editor, a live-context counter, and `timeout` / `fetch`
machines that show the timer and invocation controls.

## Embed it in your own program

The studio is an `http.Handler`. Register your machines and mount it:

```go
import "github.com/arisros/fate-studio"

srv := studio.NewServer("my app")
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

`dispatch` maps an event name from the UI to one of your typed events. A machine
registered with only `Build` (no `BuildLive`) shows its static diagram without
the live simulator.

## Design

The UI follows a small design language captured in [DESIGN.md](DESIGN.md) — a
violet-midnight palette with an electric-lime accent, applied in hand-written CSS.
There is no build step and no external font or asset request: the server is a
single static binary with everything embedded.

## License

[MIT](LICENSE) © Aris Kurniawan
