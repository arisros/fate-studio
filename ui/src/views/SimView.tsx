import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { CondMeta, Graph, GraphNode, LiveSnapshot } from "../types";
import { LazyChart as Chart } from "../graph/render/LazyChart";
import { StudioCtx } from "../graph/studioCtx";
import { useSimStream } from "../sse";
import { activeFromPath } from "../graph/active";
import { useTheme } from "../theme";
import { useToast } from "../toast";
import { ActivePath, ContextPanel, EffectsPanel, StatusBadge, Timeline } from "../components";
import { evaluateGates, type FieldEval } from "../graph/sim/gateEval";
import type { ActiveSet } from "../graph/active";

// Renders UIState fields using the JSON Schema when available; falls back to raw JSON.
function SchemaView({ schema, data }: { schema: Record<string, unknown>; data: unknown }) {
  const props = (schema.properties ?? {}) as Record<string, { type?: string }>;
  const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const entries = Object.entries(props);
  if (!entries.length) return <ContextPanel context={data} />;
  return (
    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", fontSize: 12 }}>
      {entries.map(([key, propSchema]) => {
        const val = obj[key];
        const type = propSchema.type ?? "unknown";
        return (
          <>
            <dt key={`dt-${key}`} style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{key}</dt>
            <dd key={`dd-${key}`} style={{ margin: 0, fontFamily: "var(--mono)" }}>
              {type === "boolean" ? (
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 3,
                    fontSize: 11,
                    background: val ? "var(--ok-bg, #1a3)" : "var(--danger-bg, #a33)",
                    color: "#fff",
                  }}
                >
                  {val ? "true" : "false"}
                </span>
              ) : type === "number" ? (
                <span style={{ color: "var(--number, #7cf)" }}>{val !== undefined ? String(val) : "—"}</span>
              ) : (
                <span>{val !== undefined ? String(val) : "—"}</span>
              )}
            </dd>
          </>
        );
      })}
    </dl>
  );
}

function UIStateSection({ snap, graph }: { snap: LiveSnapshot | null; graph: Graph | null }) {
  const [editing, setEditing] = useState(false);
  const [editRaw, setEditRaw] = useState("");

  const hasServerState = snap?.uiState != null;

  // When a new server UIState arrives and we're not editing, sync the edit buffer.
  useEffect(() => {
    if (!editing && hasServerState) {
      setEditRaw(JSON.stringify(snap!.uiState, null, 2));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.uiState, editing]);

  // Find the active node's uiStateSchema from the graph.
  const activeSchema = useMemo<Record<string, unknown> | null>(() => {
    if (!graph || !snap?.path) return null;
    const firstRegion = snap.path.split(" | ")[0].trim();
    const node = graph.nodes.find((n: GraphNode) => n.path === firstRegion);
    return node?.uiStateSchema ?? null;
  }, [graph, snap?.path]);

  const useStructuredView =
    !editing &&
    activeSchema != null &&
    activeSchema.type === "object" &&
    typeof activeSchema.properties === "object";

  if (!hasServerState && !editing) return null;

  let displayValue: unknown = snap?.uiState;
  let parseErr = "";
  if (editing) {
    try {
      displayValue = JSON.parse(editRaw);
    } catch (e) {
      parseErr = e instanceof Error ? e.message : "invalid JSON";
    }
  }

  return (
    <section>
      <h2>
        UI State{" "}
        <button
          className="btn ghost"
          style={{ fontSize: 11, padding: "2px 8px", marginLeft: 6 }}
          onClick={() => {
            if (editing) {
              setEditing(false);
            } else {
              setEditRaw(JSON.stringify(snap?.uiState ?? {}, null, 2));
              setEditing(true);
            }
          }}
        >
          {editing ? "reset" : "edit"}
        </button>
      </h2>
      {editing ? (
        <>
          <textarea
            className="ctx-body"
            style={{ width: "100%", resize: "vertical", minHeight: 100 }}
            value={editRaw}
            onChange={(e) => setEditRaw(e.target.value)}
          />
          {parseErr && <span style={{ fontSize: 11, color: "var(--danger)" }}>⚠ {parseErr}</span>}
        </>
      ) : useStructuredView ? (
        <SchemaView schema={activeSchema!} data={displayValue} />
      ) : (
        <ContextPanel context={displayValue} />
      )}
    </section>
  );
}

// GateEdgePanel renders one transition's gate conditions with live open/closed status.
function GateEdgePanel({
  event,
  meta,
  evals,
}: {
  event: string;
  meta: CondMeta;
  evals: FieldEval[];
}) {
  const [open, setOpen] = useState(true);
  const [sampleOpen, setSampleOpen] = useState(false);

  const allOpen = evals.length > 0 && evals.every((r) => r.status === "open");
  const anyClosed = evals.some((r) => r.status === "closed");
  const lockIcon = anyClosed ? "🔒" : allOpen ? "🔓" : "❓";

  return (
    <div style={{ marginBottom: 6, border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", cursor: "pointer", background: "var(--surface2, rgba(255,255,255,.04))" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ fontSize: 13 }}>{lockIcon}</span>
        <span style={{ flex: 1, fontSize: 12, fontFamily: "var(--mono)", fontWeight: 600 }}>{event}</span>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ padding: "6px 8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <tbody>
              {evals.map((r, i) => (
                <tr key={i}>
                  <td style={{ width: 10, paddingRight: 6 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background:
                          r.status === "open"
                            ? "var(--ok, #4c4)"
                            : r.status === "closed"
                            ? "var(--danger, #c44)"
                            : "var(--muted, #888)",
                      }}
                    />
                  </td>
                  <td style={{ color: "var(--muted)", paddingRight: 4 }}>
                    {r.field.label ?? r.field.path}
                  </td>
                  <td style={{ color: "var(--muted)", paddingRight: 4 }}>{r.field.op}</td>
                  <td style={{ fontFamily: "var(--mono)", paddingRight: 4 }}>
                    {r.field.value !== undefined ? String(r.field.value) : "—"}
                  </td>
                  <td style={{ fontFamily: "var(--mono)", color: r.status === "open" ? "var(--ok, #4c4)" : r.status === "closed" ? "var(--danger, #c44)" : "var(--muted)" }}>
                    {r.actual !== undefined ? String(r.actual) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta.sample != null && (
            <div style={{ marginTop: 4 }}>
              <button
                className="btn ghost"
                style={{ fontSize: 10, padding: "1px 6px" }}
                onClick={() => setSampleOpen((v) => !v)}
              >
                {sampleOpen ? "▾" : "▸"} sample
              </button>
              {sampleOpen && (
                <pre className="ctx-body" style={{ marginTop: 4 }}>
                  {JSON.stringify(meta.sample, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// GateSection lists all transitions from active states that have CondMeta declared.
function GateSection({ graph, snap, active }: { graph: Graph | null; snap: LiveSnapshot | null; active: ActiveSet }) {
  const gatedEdges = useMemo(() => {
    if (!graph || !snap) return [];
    const pathById = new Map(graph.nodes.map((n) => [n.id, n.path]));
    return graph.edges.filter((e) => {
      const srcPath = pathById.get(e.source) ?? "";
      return active.leaves.has(srcPath) && e.condMeta != null;
    });
  }, [graph, snap, active]);

  if (!gatedEdges.length) return null;

  return (
    <section>
      <h2>Gates</h2>
      {gatedEdges.map((edge) => {
        const meta = edge.condMeta!;
        const evals = evaluateGates(meta, snap?.context);
        return (
          <GateEdgePanel key={edge.id} event={edge.event} meta={meta} evals={evals} />
        );
      })}
    </section>
  );
}

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
          <UIStateSection snap={snap} graph={graph} />
          <GateSection graph={graph} snap={snap} active={active} />
          <section>
            <h2>Timeline</h2>
            <Timeline events={timeline} />
          </section>
        </aside>
      </div>
    </div>
  );
}
