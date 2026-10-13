package core_test

import (
	"context"
	"testing"

	"github.com/arisros/fate-studio/core"
	"github.com/arisros/fate-studio/internal/demos"
)

func TestStudio_DrivesASimulationWithoutHTTP(t *testing.T) {
	s := core.New()
	for _, d := range demos.All() {
		s.Register(d.Entry())
	}
	if _, err := s.Session("nope", "me"); err == nil {
		t.Fatal("an unknown machine should not start a session")
	}

	name := s.Machines()[0]
	sess, err := s.Session(name, "me")
	if err != nil {
		t.Fatal(err)
	}
	start := sess.Frame()
	if len(start.Events) == 0 {
		t.Fatalf("%s offers no events from %q", name, start.Path)
	}
	frames, _, unsub := sess.Subscribe()
	defer unsub()

	if err := sess.Send(context.Background(), start.Events[0]); err != nil {
		t.Fatal(err)
	}
	got := <-frames
	if len(got.Steps) != 1 || got.Steps[0].Label != start.Events[0] || got.Steps[0].From != start.Path {
		t.Fatalf("steps after one event = %+v", got.Steps)
	}

	other, err := s.Session(name, "someone else")
	if err != nil {
		t.Fatal(err)
	}
	if len(other.Frame().Steps) != 0 {
		t.Fatal("a second client should get its own session")
	}

	if ok, err := sess.Undo(); !ok || err != nil {
		t.Fatalf("undo = %v, %v", ok, err)
	}
	if back := sess.Frame(); back.Path != start.Path || len(back.Steps) != 0 {
		t.Fatalf("after undo: path %q steps %d", back.Path, len(back.Steps))
	}
}
