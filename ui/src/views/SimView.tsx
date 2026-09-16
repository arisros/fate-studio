import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { CondMeta, Graph, GraphNode, LiveSnapshot, SimFrame } from "../types";
import { LazyChart as Chart } from "../graph/render/LazyChart";
import { StudioCtx } from "../graph/studioCtx";
import { useSimStream } from "../sse";
import { activeFromPath } from "../graph/active";
import { eventsFromGraph } from "../graph/model/events";
import { useTheme } from "../theme";
import { useToast } from "../toast";
import { ActivePath, ContextPanel, EffectsPanel, StatusBadge, Timeline } from "../components";
import { evaluateGates, type FieldEval } from "../graph/sim/gateEval";
import type { ActiveSet } from "../graph/active";

// Renders UIState fields using the JSON Schema when available; falls back to raw JSON.
function SchemaView({ schema, data }: { schema: Record<string, unknown>; data: unknown }) {
  const props = (schema.properties ?? {}) as Record<string, { type?: unknown }>;
  const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const entries = Object.entries(props);
  if (!entries.length) return <ContextPanel context={data} />;
  return (
    <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", fontSize: 12 }}>
      {entries.map(([key, propSchema]) => {
        const val = obj[key];
        const type = schemaType(propSchema) ?? "unknown";
        return (
          <Fragment key={key}>
            <dt style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{key}</dt>
            <dd style={{ margin: 0, fontFamily: "var(--mono)" }}>
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
              ) : type === "number" || type === "integer" ? (
                <span style={{ color: "var(--number, #7cf)" }}>{val !== undefined ? String(val) : "—"}</span>
              ) : (
                <span>{val !== undefined ? String(val) : "—"}</span>
              )}
            </dd>
          </Fragment>
        );
      })}
    </dl>
  );
}

function UIStateSection({ snap, graph }: { snap: LiveSnapshot | null; graph: Graph | null }) {
  const views = snap?.ui_state;
  const schemaByPath = useMemo(
    () => new Map((graph?.nodes ?? []).map((n: GraphNode) => [n.path, n.ui_state_schema])),
    [graph],
  );
  if (!views && !snap?.ui_state_error) return null;

  return (
    <section>
      <h2>View models</h2>
      {snap?.ui_state_error && <p className="err-box">{snap.ui_state_error}</p>}
      {Object.keys(views ?? {})
        .sort()
        .map((path) => {
          const schema = schemaByPath.get(path);
          const data = views![path];
          return (
            <div key={path} className="ui-state">
              <div className="muted">{path}</div>
              {schema && schemaType(schema) === "object" && typeof schema.properties === "object" ? (
                <SchemaView schema={schema} data={data} />
              ) : (
                <ContextPanel context={data} />
              )}
            </div>
          );
        })}
    </section>
  );
}

// schemaType returns a schema's type, ignoring the "null" that marks a
// nullable value.
function schemaType(schema: { type?: unknown }): string | undefined {
  const t = schema.type;
  if (Array.isArray(t)) return t.find((x) => x !== "null");
  return typeof t === "string" ? t : undefined;
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
      return active.paths.has(srcPath) && e.cond_meta != null;
    });
  }, [graph, snap, active]);

  if (!gatedEdges.length) return null;

  return (
    <section>
      <h2>Gates</h2>
      {gatedEdges.map((edge) => {
        const meta = edge.cond_meta!;
        const evals = evaluateGates(meta, snap?.context);
        return (
          <GateEdgePanel key={edge.id} event={edge.event} meta={meta} evals={evals} />
        );
      })}
    </section>
  );
}

// useTimeline returns the frame's timeline, or fetches it after each frame
// when the frame does not carry one.
function useTimeline(name: string, snap: SimFrame | null): string[] {
  const [fetched, setFetched] = useState<string[]>([]);
  const own = snap?.timeline;
  useEffect(() => {
    if (!snap || own) return;
    let stale = false;
    api
      .timeline(name)
      .then((t) => !stale && setFetched(t))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [name, snap, own]);
  return own ?? fetched;
}

export function SimView() {
  const { name = "" } = useParams();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [mode] = useTheme();
  const toast = useToast();
  const { snapshot, conn } = useSimStream(name);
  const replayed = useRef(false);

  useEffect(() => {
    api.graph(name).then(setGraph).catch((e) => toast(String(e), "err"));
  }, [name, toast]);

  const snap: SimFrame | null = snapshot;
  const active = useMemo(() => activeFromPath(snap?.path ?? ""), [snap?.path]);
  const sendable = useMemo(
    () => new Set(snap?.events ?? (graph ? eventsFromGraph(graph, active.paths) : [])),
    [snap?.events, graph, active],
  );
  const timeline = useTimeline(name, snap);

  // Mutations broadcast their resulting frame before replying, so state and
  // timeline arrive over SSE; nothing to mirror locally.
  const guard = useCallback(
    async (p: Promise<unknown>, label: string) => {
      try {
        await p;
      } catch (e) {
        toast(`${label}: ${e instanceof Error ? e.message : String(e)}`, "err");
      }
    },
    [toast],
  );

  const onSend = useCallback(
    (event: string) => void guard(api.send(name, event), "send"),
    [name, guard],
  );
  const onFire = useCallback(
    (id: string) => void guard(api.timer(name, id), "timer"),
    [name, guard],
  );
  const onResolve = useCallback(
    (id: string, output: string) => void guard(api.resolve(name, id, output), "resolve"),
    [name, guard],
  );
  const onReject = useCallback(
    (id: string) => void guard(api.reject(name, id, "rejected from studio"), "reject"),
    [name, guard],
  );
  const onUndo = useCallback(() => void guard(api.undo(name), "undo"), [name, guard]);
  const onReset = useCallback(() => void guard(api.reset(name), "reset"), [name, guard]);
  const onImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      await guard(api.importSnapshot(name, await f.text()), "import");
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
      for (const ev of seq) {
        try {
          await api.send(name, ev);
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
          {!!(snap?.timers?.length || snap?.invocations?.length) && (
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
