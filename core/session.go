package core

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// sessionTTL is how long an idle session survives before the reaper evicts it.
const sessionTTL = 30 * time.Minute

// maxHistory caps the per-session undo stack (defensive — prevents unbounded
// memory if someone scripts thousands of events).
const maxHistory = 500

// Session is one client's live simulation of one machine. It is safe for
// concurrent use.
type Session struct {
	build func() LiveInstance

	mu       sync.Mutex
	live     LiveInstance
	subs     []chan Frame
	history  [][]byte // snapshot bytes captured *before* each applied event
	events   []string // event names, parallel to history
	steps    []Step   // what each event did, parallel to history
	lastSeen time.Time
}

// Frame is the single payload every simulator response carries — the SSE
// stream and the POST endpoints alike. It is the actor snapshot plus the
// session-level timeline, so a client never has to reconstruct session state
// it cannot see (a reloaded page used to show an empty timeline while the
// server still held the full history).
type Frame struct {
	LiveSnapshot
	Timeline []string `json:"timeline"`
	Steps    []Step   `json:"steps"`
}

// Step is one applied step of a session: what was applied and the active
// path on either side of it.
type Step struct {
	Kind  string `json:"kind"` // event, timer, resolve or reject
	Label string `json:"label"`
	From  string `json:"from"`
	To    string `json:"to"`
}

// frameLocked builds the frame for the current state. The mutex must be held,
// which is what makes "apply then publish" atomic: two concurrent requests can
// no longer interleave such that the older snapshot is the one delivered last.
func (s *Session) frameLocked() Frame {
	tl := make([]string, len(s.events))
	copy(tl, s.events)
	steps := make([]Step, len(s.steps))
	copy(steps, s.steps)
	return Frame{LiveSnapshot: s.live.Snapshot(), Timeline: tl, Steps: steps}
}

// Frame returns the current frame.
func (s *Session) Frame() Frame {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.frameLocked()
}

// Touch marks the session as in use, so the idle reaper keeps it.
func (s *Session) Touch() {
	s.mu.Lock()
	s.lastSeen = time.Now()
	s.mu.Unlock()
}

// Send dispatches the named event. A rejected event leaves the session, and
// its history, as it was.
func (s *Session) Send(ctx context.Context, ev string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	before, perr := s.live.Persist()
	if perr == nil {
		if len(s.history) >= maxHistory {
			s.history = s.history[1:]
			s.events = s.events[1:]
			s.steps = s.steps[1:]
		}
		s.history = append(s.history, before)
		s.events = append(s.events, ev)
		s.steps = append(s.steps, Step{Kind: "event", Label: ev, From: s.live.Snapshot().Path})
	}
	if err := s.live.SendEvent(ctx, ev); err != nil {
		if perr == nil { // roll back the history push
			s.history = s.history[:len(s.history)-1]
			s.events = s.events[:len(s.events)-1]
			s.steps = s.steps[:len(s.steps)-1]
		}
		return err
	}
	if perr == nil {
		s.steps[len(s.steps)-1].To = s.live.Snapshot().Path
	}
	s.broadcastLocked()
	return nil
}

// applyEffect captures the pre-effect snapshot (for undo/timeline), runs fn,
// and rolls back the history push if fn fails. Used for timer/invocation
// effects, which advance the machine like events but aren't user events.
func (s *Session) applyEffect(label string, step Step, fn func() error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	before, perr := s.live.Persist()
	if perr == nil {
		if len(s.history) >= maxHistory {
			s.history = s.history[1:]
			s.events = s.events[1:]
			s.steps = s.steps[1:]
		}
		step.From = s.live.Snapshot().Path
		s.history = append(s.history, before)
		s.events = append(s.events, label)
		s.steps = append(s.steps, step)
	}
	if err := fn(); err != nil {
		if perr == nil {
			s.history = s.history[:len(s.history)-1]
			s.events = s.events[:len(s.events)-1]
			s.steps = s.steps[:len(s.steps)-1]
		}
		return err
	}
	if perr == nil {
		s.steps[len(s.steps)-1].To = s.live.Snapshot().Path
	}
	s.broadcastLocked()
	return nil
}

// FireTimer delivers the elapsed delay of an armed timer.
func (s *Session) FireTimer(id string) error {
	return s.applyEffect("⏲ after", Step{Kind: "timer", Label: id}, func() error { return s.live.FireTimer(id) })
}

// Resolve completes a pending invocation with a JSON output.
func (s *Session) Resolve(id, output string) error {
	return s.applyEffect("✓ "+id, Step{Kind: "resolve", Label: id}, func() error { return s.live.ResolveInvocation(id, output) })
}

// Reject fails a pending invocation with an error message.
func (s *Session) Reject(id, errMsg string) error {
	return s.applyEffect("✗ "+id, Step{Kind: "reject", Label: id}, func() error { return s.live.RejectInvocation(id, errMsg) })
}

// Undo reverts the last step. It reports false when there is nothing to undo.
func (s *Session) Undo() (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.history) == 0 {
		return false, nil
	}
	snap := s.history[len(s.history)-1]
	s.history = s.history[:len(s.history)-1]
	s.events = s.events[:len(s.events)-1]
	s.steps = s.steps[:len(s.steps)-1]
	if err := s.live.Restore(snap); err != nil {
		return true, err
	}
	s.broadcastLocked()
	return true, nil
}

// Reset starts the machine over with a fresh actor and an empty history,
// keeping subscribers attached.
func (s *Session) Reset() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	live := s.build()
	if err := live.Start(context.Background()); err != nil {
		return err
	}
	s.live = live
	s.history = nil
	s.events = nil
	s.steps = nil
	s.broadcastLocked()
	return nil
}

// Import restores the actor from a persisted snapshot and clears the history.
func (s *Session) Import(b []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.live.Restore(b); err != nil {
		return err
	}
	s.history = nil
	s.events = nil
	s.steps = nil
	s.broadcastLocked()
	return nil
}

// Timeline returns the label of every applied step, oldest first.
func (s *Session) Timeline() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]string, len(s.events))
	copy(out, s.events)
	return out
}

// Export returns the actor's persisted snapshot.
func (s *Session) Export() ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.live.Persist()
}

// broadcastLocked publishes the current frame to every subscriber. The mutex
// must be held, so a subscriber receives exactly the state the mutation
// produced. Each subscriber holds only the latest frame: an unread older frame
// is replaced, so a slow client skips ahead instead of stalling the session or
// ending on a stale state.
func (s *Session) broadcastLocked() {
	frame := s.frameLocked()
	for _, ch := range s.subs {
		select {
		case <-ch:
		default:
		}
		select {
		case ch <- frame:
		default:
		}
	}
}

// Subscribe returns a channel of frames, the frame current at the time of the
// call, and a function that ends the subscription. No change can fall between
// that frame and the first one on the channel. A slow reader skips to the
// latest frame.
func (s *Session) Subscribe() (<-chan Frame, Frame, func()) {
	ch := make(chan Frame, 1)
	s.mu.Lock()
	s.subs = append(s.subs, ch)
	initial := s.frameLocked()
	s.mu.Unlock()
	return ch, initial, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		for i, c := range s.subs {
			if c == ch {
				s.subs = append(s.subs[:i], s.subs[i+1:]...)
				close(ch)
				return
			}
		}
	}
}

type sessionStore struct {
	mu sync.Mutex
	m  map[string]*Session // key: machine + "|" + client
}

func newSessionStore() *sessionStore {
	st := &sessionStore{m: map[string]*Session{}}
	go st.reap()
	return st
}

func (st *sessionStore) getOrCreate(key string, build func() LiveInstance) (*Session, error) {
	st.mu.Lock()
	defer st.mu.Unlock()
	if s, ok := st.m[key]; ok {
		s.lastSeen = time.Now()
		return s, nil
	}
	if build == nil {
		return nil, fmt.Errorf("no live simulator registered")
	}
	live := build()
	if err := live.Start(context.Background()); err != nil {
		return nil, fmt.Errorf("actor start: %w", err)
	}
	s := &Session{build: build, live: live, lastSeen: time.Now()}
	st.m[key] = s
	return s, nil
}

// reap evicts idle sessions so actors don't accumulate.
func (st *sessionStore) reap() {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for range t.C {
		cutoff := time.Now().Add(-sessionTTL)
		st.mu.Lock()
		for k, s := range st.m {
			s.mu.Lock()
			idle := s.lastSeen.Before(cutoff)
			s.mu.Unlock()
			if idle {
				delete(st.m, k)
			}
		}
		st.mu.Unlock()
	}
}
