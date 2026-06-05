import { useEffect, useRef, useState } from "react";
import type { LiveSnapshot } from "./types";

export type ConnState = "connecting" | "open" | "closed";

// useSimStream opens an EventSource to /sim/{name}/stream and exposes the
// latest LiveSnapshot. The fate_sid cookie (set by the server) scopes the
// session, so the same browser shares one actor with the POST endpoints.
export function useSimStream(name: string | undefined): {
  snapshot: LiveSnapshot | null;
  conn: ConnState;
} {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!name) return;
    setConn("connecting");
    const es = new EventSource(`/sim/${encodeURIComponent(name)}/stream`, {
      withCredentials: true,
    });
    esRef.current = es;
    es.onopen = () => setConn("open");
    es.onmessage = (ev) => {
      try {
        setSnapshot(JSON.parse(ev.data) as LiveSnapshot);
        setConn("open");
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => setConn("closed");
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [name]);

  return { snapshot, conn };
}

// applySnap merges a SnapResponse (from a POST) into snapshot state immediately,
// so the UI updates without waiting for the SSE round-trip.
export function nullSnapshot(): LiveSnapshot {
  return { path: "", context: {}, status: "connecting", ascii: "" };
}
