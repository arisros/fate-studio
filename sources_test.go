package studio

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sc "github.com/arisros/fate"
)

func machineLive(t *testing.T, s *Server, name string) bool {
	t.Helper()
	rr := httptest.NewRecorder()
	s.handleAPIMachines(rr, httptest.NewRequest(http.MethodGet, "/api/machines", nil))
	var infos []machineInfo
	if err := json.Unmarshal(rr.Body.Bytes(), &infos); err != nil {
		t.Fatal(err)
	}
	for _, m := range infos {
		if m.Name == name {
			return m.Live
		}
	}
	t.Fatalf("machine %q not listed", name)
	return false
}

func TestLoadSnapshots_KeepsProxyURLOnReload(t *testing.T) {
	dir := t.TempDir()
	writeSnap(t, dir, "tl", tlDescriptor)
	s := NewServer("test")
	if _, err := s.LoadSnapshots(dir); err != nil {
		t.Fatal(err)
	}
	if !s.SetProxyURL("tl", "http://remote.invalid/fsm") {
		t.Fatal("SetProxyURL did not find tl")
	}
	if s.SetProxyURL("missing", "http://remote.invalid") {
		t.Fatal("SetProxyURL reported an unknown machine as found")
	}
	if err := s.loadSnapshotFile(filepath.Join(dir, "tl.json")); err != nil {
		t.Fatal(err)
	}
	if e, _ := s.lookup("tl"); e.ProxyURL != "http://remote.invalid/fsm" {
		t.Fatalf("ProxyURL after reload = %q", e.ProxyURL)
	}
	if !machineLive(t, s, "tl") {
		t.Fatal("a proxied snapshot should stay live after reload")
	}
}

func TestLoadSnapshots_DoesNotShadowLiveMachine(t *testing.T) {
	dir := t.TempDir()
	writeSnap(t, dir, "tl", tlDescriptor)
	s := NewServer("test")
	s.Register(Entry{
		Name:      "tl",
		Build:     func() sc.MachineDescriptor { return sc.MachineDescriptor{ID: "live"} },
		BuildLive: func() LiveInstance { return nil },
	})
	n, err := s.LoadSnapshots(dir)
	if n != 0 || err == nil || !strings.Contains(err.Error(), "live simulator") {
		t.Fatalf("n=%d err=%v", n, err)
	}
	if !machineLive(t, s, "tl") {
		t.Fatal("the live machine was replaced by a snapshot")
	}
}

func TestWatch_LoadsNewAndChangedFiles(t *testing.T) {
	dir := t.TempDir()
	writeSnap(t, dir, "tl", tlDescriptor)
	s := NewServer("test")
	if _, err := s.LoadSnapshots(dir); err != nil {
		t.Fatal(err)
	}
	events, unsub := s.events.subscribe()
	defer unsub()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		s.Watch(ctx, dir)
		close(done)
	}()
	defer func() {
		cancel()
		<-done
	}()

	// Written before the first tick: the initial scan runs synchronously, so
	// only files present when Watch started count as already loaded.
	time.Sleep(50 * time.Millisecond)
	writeSnap(t, dir, "added", strings.Replace(tlDescriptor, `"traffic-light"`, `"added"`, 1))
	expectEvent(t, events, "added")
	if _, ok := s.lookup("added"); !ok {
		t.Fatal("new file was not registered")
	}

	changed := strings.Replace(tlDescriptor, `"TIMER"`, `"TICK"`, -1)
	writeSnap(t, dir, "tl", changed)
	expectEvent(t, events, "tl")
	e, _ := s.lookup("tl")
	if _, ok := e.Build().States["red"].On["TICK"]; !ok {
		t.Fatal("changed file was not reloaded")
	}
}

func expectEvent(t *testing.T, ch chan string, want string) {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for {
		select {
		case got := <-ch:
			if got == want {
				return
			}
		case <-deadline:
			t.Fatalf("no graph-changed event for %q", want)
		}
	}
}

func TestEvents_StreamsGraphChanged(t *testing.T) {
	s := NewServer("test")
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	r := bufio.NewReader(resp.Body)
	if line, _ := r.ReadString('\n'); !strings.HasPrefix(line, ": connected") {
		t.Fatalf("first line %q", line)
	}
	for !hasSubscriber(s) {
		time.Sleep(10 * time.Millisecond)
	}
	s.events.publish("tl")
	var got []string
	for len(got) < 2 {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatal(err)
		}
		if line = strings.TrimSpace(line); line != "" {
			got = append(got, line)
		}
	}
	if strings.Join(got, "|") != "event: graph-changed|data: tl" {
		t.Fatalf("got %q", got)
	}
}

func hasSubscriber(s *Server) bool {
	s.events.mu.Lock()
	defer s.events.mu.Unlock()
	return len(s.events.subs) > 0
}

func TestBroadcast_KeepsOnlyTheLatestFrame(t *testing.T) {
	sess := &session{live: &fakeLive{}}
	ch, _, unsub := sess.subscribe()
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

func TestProxy_ForwardsToRemoteSimulator(t *testing.T) {
	var gotPath string
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		http.SetCookie(w, &http.Cookie{Name: "fate_sid", Value: "remote", Path: "/"})
		_, _ = io.WriteString(w, `{"path":"green"}`)
	}))
	defer remote.Close()

	dir := t.TempDir()
	writeSnap(t, dir, "tl", tlDescriptor)
	s := NewServer("test").SetBasePath("/studio/")
	if _, err := s.LoadSnapshots(dir); err != nil {
		t.Fatal(err)
	}
	s.SetProxyURL("tl", remote.URL+"/fsm/tl")
	mux := http.NewServeMux()
	mux.Handle("/studio/", http.StripPrefix("/studio", s.Handler()))
	front := httptest.NewServer(mux)
	defer front.Close()

	resp, err := http.Post(front.URL+"/studio/sim/tl/send", "application/x-www-form-urlencoded", strings.NewReader("event=NEXT"))
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if gotPath != "/fsm/tl/send" || string(body) != `{"path":"green"}` {
		t.Fatalf("remote saw %q, client got %s", gotPath, body)
	}
	if c := resp.Cookies(); len(c) != 1 || c[0].Path != "/studio/" {
		t.Fatalf("cookies = %+v, want one scoped to /studio/", c)
	}

	remote.Close()
	resp, err = http.Post(front.URL+"/studio/sim/tl/send", "application/x-www-form-urlencoded", strings.NewReader("event=NEXT"))
	if err != nil {
		t.Fatal(err)
	}
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadGateway || !strings.Contains(string(body), `simulator for "tl" is unreachable`) {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
}
