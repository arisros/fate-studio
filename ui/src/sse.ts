import { useEffect, useRef, useState } from "react";
import type { SimFrame } from "./types";

export type ConnState = "connecting" | "open" | "closed";

// useSimStream opens an EventSource to /sim/{name}/stream and exposes the
// latest SimFrame. The fate_sid cookie (set by the server) scopes the
// session, so the same browser shares one actor with the POST endpoints.
export function useSimStream(name: string | undefined): {
  snapshot: SimFrame | null;
  conn: ConnState;
} {
  const [snapshot, setSnapshot] = useState<SimFrame | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!name) return;
    setConn("connecting");
    const es = new EventSource(`sim/${encodeURIComponent(name)}/stream`, {
      withCredentials: true,
    });
    esRef.current = es;
    es.onopen = () => setConn("open");
    es.onmessage = (ev) => {
      try {
        setSnapshot(JSON.parse(ev.data) as SimFrame);
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
