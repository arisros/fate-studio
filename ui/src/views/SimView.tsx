import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, gateIcon } from "../icons";
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
import { useGuide } from "../guide";
import { Guide } from "../GuideOverlay";

// Renders UIState fields using the JSON Schema when available; falls back to raw JSON.
function SchemaView({ schema, data }: { schema: Record<string, unknown>; data: unknown }) {
  const props = (schema.properties ?? {}) as Record<string, { type?: unknown }>;
  const obj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  const entries = Object.entries(props);
  if (!entries.length) return <ContextPanel context={data} />;
  return (
    <dl className="vm-fields">
      {entries.map(([key, propSchema]) => {
        const val = obj[key];
        const type = schemaType(propSchema) ?? "unknown";
        return (
          <Fragment key={key}>
            <dt>{key}</dt>
            <dd>
              {type === "boolean" ? (
                <span className={`bool-chip ${val ? "yes" : "no"}`}>
                  {val ? "true" : "false"}
                </span>
              ) : type === "number" || type === "integer" ? (
                <span className="vm-num">{val !== undefined ? String(val) : "—"}</span>
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

  return (
    <div className="gate">
      <div
        className="gate-head"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={gateIcon(anyClosed, allOpen)} className={anyClosed ? "gate-closed" : allOpen ? "gate-open" : undefined} />
        <span className="gate-ev">{event}</span>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={12} className="gate-caret" />
      </div>
      {open && (
        <div className="gate-body">
          <table className="gate-table">
            <tbody>
              {evals.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className={`vsim-field-dot dot-${r.status === "open" ? "open" : r.status === "closed" ? "closed" : "unknown"}`} />
                  </td>
                  <td className="dim">
                    {r.field.label ?? r.field.path}
                  </td>
                  <td className="dim">{r.field.op}</td>
                  <td className="val">
                    {r.field.value !== undefined ? String(r.field.value) : "—"}
                  </td>
                  <td className={`val ${r.status === "open" ? "open" : r.status === "closed" ? "closed" : "dim"}`}>
                    {r.actual !== undefined ? String(r.actual) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta.sample != null && (
            <div style={{ marginTop: 4 }}>
              <button
                className="btn ghost small"
                onClick={() => setSampleOpen((v) => !v)}
              >
                <Icon name={sampleOpen ? "chevron-down" : "chevron-right"} size={12} /> Sample
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

// eventTargets maps each event sendable from the active states to the state it
// leads to, for the inspector's event list.
function eventTargets(graph: Graph, activePaths: Set<string>): Map<string, string> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const found = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    const source = byId.get(e.source);
    if (!source || !activePaths.has(source.path)) continue;
    const label = e.internal || e.target === e.source ? "self" : (byId.get(e.target)?.label ?? "");
    if (!label) continue;
    if (!found.has(e.event)) found.set(e.event, new Set());
    found.get(e.event)!.add(label);
  }
  const out = new Map<string, string>();
  for (const [event, labels] of found) {
    const list = [...labels];
    out.set(event, list.length > 2 ? `${list.slice(0, 2).join(", ")} +${list.length - 2}` : list.join(", "));
  }
  return out;
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
  const targets = useMemo(() => (graph ? eventTargets(graph, active.paths) : new Map<string, string>()), [graph, active]);
  const timeline = useTimeline(name, snap);
  // A machine that offers no events is read-only here, and the guide has
  // nothing to point at.
  const guide = useGuide(conn === "open" && !!graph && sendable.size > 0);

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
        <button className="btn ghost" data-guide="undo" onClick={onUndo}><Icon name="undo" />Undo</button>
        <button className="btn ghost" onClick={onReset}><Icon name="reset" />Reset</button>
        <button className="btn ghost" onClick={onImport}><Icon name="import" />Import</button>
        <a className="btn ghost" href={api.exportURL(name)}><Icon name="export" />Export</a>
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
          <section data-guide="events">
            <h2>Events</h2>
            <div className="ev-btns">
              {[...sendable].sort().map((ev) => (
                <div key={ev} className="ev-row">
                  <Icon name="play" size={11} className="ev-send" />
                  <button className="ev-btn" onClick={() => onSend(ev)}>
                    {ev}
                  </button>
                  {targets.get(ev) && (
                    <span className="ev-target">
                      <Icon name={targets.get(ev) === "self" ? "loop" : "arrow-right"} size={12} />
                      {targets.get(ev)}
                    </span>
                  )}
                </div>
              ))}
              {!sendable.size && <span className="muted">None from here</span>}
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
            <Timeline events={timeline} steps={snap?.steps} canSend={sendable.size > 0} />
          </section>
        </aside>
      </div>
      {guide.step != null && <Guide step={guide.step} onNext={guide.next} />}
    </div>
  );
}
