import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { Graph, LiveSnapshot } from "../types";
import { Chart } from "../graph/Chart";
import { StudioCtx } from "../graph/studioCtx";
import { useSimStream } from "../sse";
import { activeFromPath } from "../graph/active";
import { useTheme } from "../theme";
import { useToast } from "../toast";
import { ActivePath, ContextPanel, EffectsPanel, StatusBadge, Timeline } from "../components";

function sendableEvents(graph: Graph, leaves: Set<string>): Set<string> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n.path]));
  const s = new Set<string>();
  for (const e of graph.edges) {
    const srcPath = byId.get(e.source);
    if (srcPath && leaves.has(srcPath)) s.add(e.event);
  }
  return s;
}

export function SimView() {
  const { name = "" } = useParams();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [mode] = useTheme();
  const toast = useToast();
  const { snapshot, conn } = useSimStream(name);
  const [timeline, setTimeline] = useState<string[]>([]);
  const replayed = useRef(false);

  useEffect(() => {
    api.graph(name).then(setGraph).catch((e) => toast(String(e), "err"));
  }, [name, toast]);

  const snap: LiveSnapshot | null = snapshot;
  const active = useMemo(() => activeFromPath(snap?.path ?? ""), [snap?.path]);
  const sendable = useMemo(
    () => (graph ? sendableEvents(graph, active.leaves) : new Set<string>()),
    [graph, active],
  );

  const guard = useCallback(
    async (p: Promise<unknown>, label: string, push?: string) => {
      try {
        await p;
        if (push !== undefined) setTimeline((t) => [...t, push]);
      } catch (e) {
        toast(`${label}: ${e instanceof Error ? e.message : String(e)}`, "err");
      }
    },
    [toast],
  );

  const onSend = useCallback(
    (event: string) => void guard(api.send(name, event), "send", event),
    [name, guard],
  );
  const onFire = useCallback(
    (id: string) => void guard(api.timer(name, id), "timer", "⏲ after"),
    [name, guard],
  );
  const onResolve = useCallback(
    (id: string, output: string) => void guard(api.resolve(name, id, output), "resolve", `✓ ${id}`),
    [name, guard],
  );
  const onReject = useCallback(
    (id: string) => void guard(api.reject(name, id, "rejected from studio"), "reject", `✗ ${id}`),
    [name, guard],
  );
  const onUndo = useCallback(() => {
    void guard(api.undo(name), "undo").then(() => setTimeline((t) => t.slice(0, -1)));
  }, [name, guard]);
  const onReset = useCallback(() => {
    void guard(api.reset(name), "reset").then(() => setTimeline([]));
  }, [name, guard]);
  const onImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      await guard(api.importSnapshot(name, await f.text()), "import");
      setTimeline([]);
    };
    input.click();
  }, [name, guard]);

  // Deep-link replay: #e=ev1,ev2 — reset then send the sequence once.
  useEffect(() => {
    if (replayed.current || !graph || conn !== "open") return;
    const m = /#e=([^&]+)/.exec(window.location.hash);
    if (!m) return;
    replayed.current = true;
    const seq = decodeURIComponent(m[1]).split(",").filter(Boolean);
    (async () => {
      await api.reset(name).catch(() => {});
      setTimeline([]);
      for (const ev of seq) {
        try {
          await api.send(name, ev);
          setTimeline((t) => [...t, ev]);
        } catch {
          toast(`replay stopped at ${ev}`, "err");
          break;
        }
      }
    })();
  }, [graph, conn, name, toast]);

  return (
    <div className="sim-view">
      <div className="subbar">
        <span className="mtitle">{name}</span>
        <StatusBadge status={snap?.status ?? "connecting"} conn={conn} />
        <div className="spacer" />
        <button className="btn ghost" onClick={onUndo}>undo</button>
        <button className="btn ghost" onClick={onReset}>reset</button>
        <button className="btn ghost" onClick={onImport}>import</button>
        <a className="btn ghost" href={api.exportURL(name)}>export</a>
      </div>

      <div className="sim-body">
        <div className="canvas">
          {graph && (
            <StudioCtx.Provider value={{ interactive: true, sendable, onSend }}>
              <Chart machine={name} graph={graph} activePath={snap?.path ?? ""} colorMode={mode} />
            </StudioCtx.Provider>
          )}
        </div>
        <aside className="inspector">
          <section>
            <h2>Active state</h2>
            <ActivePath path={snap?.path ?? ""} />
          </section>
          <section>
            <h2>Events</h2>
            <div className="ev-btns">
              {[...sendable].sort().map((ev) => (
                <button key={ev} className="ev-btn" onClick={() => onSend(ev)}>
                  {ev}
                </button>
              ))}
              {!sendable.size && <span className="muted">none from here</span>}
            </div>
          </section>
          {(snap?.timers?.length || snap?.invocations?.length) && (
            <section>
              <h2>Pending effects</h2>
              <EffectsPanel
                timers={snap?.timers ?? []}
                invocations={snap?.invocations ?? []}
                onFire={onFire}
                onResolve={onResolve}
                onReject={onReject}
              />
            </section>
          )}
          <section>
            <h2>Context</h2>
            <ContextPanel context={snap?.context} />
          </section>
          <section>
            <h2>Timeline</h2>
            <Timeline events={timeline} />
          </section>
        </aside>
      </div>
    </div>
  );
}
