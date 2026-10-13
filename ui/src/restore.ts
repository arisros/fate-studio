import { useEffect, useRef } from "react";
import { api } from "./api";
import { useToast } from "./toast";
import type { SimFrame, SimStep } from "./types";

export interface Remembered {
  session: string;
  steps: SimStep[];
}

// shouldReplay reports whether a frame comes from a session that replaced the
// one the steps were recorded in: the server lost it, usually to a rebuild, and
// is back at the start.
export function shouldReplay(prev: Remembered | null, frame: SimFrame): prev is Remembered {
  return (
    !!prev &&
    !!frame.session &&
    prev.session !== frame.session &&
    prev.steps.length > 0 &&
    (frame.steps?.length ?? 0) === 0
  );
}

export function replayMessage(applied: number, total: number, error?: string): string {
  const steps = total === 1 ? "1 step" : `${total} steps`;
  if (applied === total) return `Machine reloaded. Replayed ${steps}.`;
  return `Machine reloaded. Replayed ${applied} of ${steps}: ${error ?? "the rest no longer apply"}`;
}

const key = (name: string) => `fate-studio:steps:${document.baseURI}:${name}`;

function recall(name: string): Remembered | null {
  try {
    const raw = sessionStorage.getItem(key(name));
    return raw ? (JSON.parse(raw) as Remembered) : null;
  } catch {
    return null;
  }
}

function remember(name: string, r: Remembered) {
  try {
    sessionStorage.setItem(key(name), JSON.stringify(r));
  } catch {
    /* storage is a convenience; the page works without it */
  }
}

// useSessionRestore keeps a simulation in place across a server restart. It
// remembers the steps of the current session and, when the stream comes back
// under a new session id, replays them against the rebuilt machine. onReloaded
// fires whenever the session id changes, so the caller can refetch the chart.
export function useSessionRestore(name: string, frame: SimFrame | null, onReloaded: () => void) {
  const toast = useToast();
  const busy = useRef(false);
  const reloaded = useRef(onReloaded);
  reloaded.current = onReloaded;

  useEffect(() => {
    if (!name || !frame?.session || busy.current) return;
    const prev = recall(name);
    if (prev && prev.session !== frame.session) reloaded.current();
    if (!shouldReplay(prev, frame)) {
      remember(name, { session: frame.session, steps: frame.steps ?? [] });
      return;
    }
    // Recorded before the request so a failed replay is not retried forever.
    remember(name, { session: frame.session, steps: [] });
    busy.current = true;
    api
      .replay(name, prev.steps)
      .then((r) => {
        remember(name, { session: r.session ?? frame.session!, steps: r.steps ?? [] });
        const { applied, total, error } = r.replay;
        toast(replayMessage(applied, total, error), applied === total ? "ok" : "err");
      })
      .catch((e) => toast(`replay: ${e instanceof Error ? e.message : String(e)}`, "err"))
      .finally(() => {
        busy.current = false;
      });
  }, [name, frame, toast]);
}
