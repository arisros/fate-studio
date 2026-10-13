// Package studio is a reusable, embeddable HTTP statechart studio — an
// XState-Studio-style viewer and live simulator for github.com/arisros/fate.
// Any program can build its own studio server, register its machines (static
// descriptors and/or live actors), and serve an interactive simulator.
//
// The fate-studio binary registers a set of demo machines; an application
// registers its own production machines by supplying a LiveInstance backed by
// the real machine.
//
// The studio's logic lives in the core package, which has no HTTP in it. This
// package is the web front end over it.
package studio

import (
	"github.com/arisros/fate/describe"
	"github.com/arisros/fate/engine"

	"github.com/arisros/fate-studio/core"
)

// Entry is one registered machine. See [core.Entry].
type Entry = core.Entry

// LiveInstance is a type-erased statechart actor the simulator drives. Build
// one with NewLiveActor. See [core.LiveInstance].
type LiveInstance = core.LiveInstance

// LiveSnapshot is the state pushed to the browser after every step. See
// [core.LiveSnapshot].
type LiveSnapshot = core.LiveSnapshot

// TimerInfo describes one armed delayed transition. See [core.TimerInfo].
type TimerInfo = core.TimerInfo

// InvokeInfo describes one pending invocation. See [core.InvokeInfo].
type InvokeInfo = core.InvokeInfo

// ErrUnknownEvent is the error a dispatch func returns for an unrecognised
// event name. The studio surfaces it as HTTP 400.
type ErrUnknownEvent = core.ErrUnknownEvent

// NewLiveActor builds a LiveInstance from a machine, an event-name dispatcher
// and a descriptor function. See [core.NewLiveActor].
func NewLiveActor[Ctx any, Evt any](
	m *engine.Machine[Ctx, Evt],
	dispatch func(name string) (Evt, error),
	describe func() describe.MachineDescriptor,
) LiveInstance {
	return core.NewLiveActor(m, dispatch, describe)
}
