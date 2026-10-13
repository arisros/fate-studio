package core

import (
	"strings"
	"testing"
)

func TestBroadcast_KeepsOnlyTheLatestFrame(t *testing.T) {
	sess := &Session{live: &fakeLive{}}
	ch, _, unsub := sess.Subscribe()
	defer unsub()
	for _, ev := range []string{"a", "b", "c"} {
		sess.mu.Lock()
		sess.events = append(sess.events, ev)
		sess.broadcastLocked()
		sess.mu.Unlock()
	}
	frame := <-ch
	if strings.Join(frame.Timeline, ",") != "a,b,c" {
		t.Fatalf("slow subscriber got timeline %v, want the latest", frame.Timeline)
	}
	select {
	case extra := <-ch:
		t.Fatalf("unexpected second frame %v", extra.Timeline)
	default:
	}
}

type fakeLive struct{ LiveInstance }

func (*fakeLive) Snapshot() LiveSnapshot { return LiveSnapshot{Path: "x"} }
