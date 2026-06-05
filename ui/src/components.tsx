import { useMemo, useState } from "react";
import type { InvokeInfo, TimerInfo } from "./types";

export function StatusBadge({ status, conn }: { status: string; conn: string }) {
  const cls = status === "done" ? "done" : status === "error" ? "err" : conn === "open" ? "run" : "wait";
  return <span className={`badge ${cls}`}>{conn === "closed" ? "disconnected" : status}</span>;
}

export function ActivePath({ path }: { path: string }) {
  if (!path) return <code className="state-path">—</code>;
  return (
    <code className="state-path">
      {path.split(" | ").map((p, i) => (
        <span key={i} className="region">
          {p}
        </span>
      ))}
    </code>
  );
}

export function ContextPanel({ context }: { context: unknown }) {
  const [filter, setFilter] = useState("");
  const text = useMemo(() => {
    try {
      return JSON.stringify(context ?? {}, null, 2);
    } catch {
      return String(context);
    }
  }, [context]);
  const shown = useMemo(() => {
    if (!filter.trim()) return text;
    let re: RegExp;
    try {
      re = new RegExp(filter, "i");
    } catch {
      return text;
    }
    return text
      .split("\n")
      .filter((l) => re.test(l))
      .join("\n");
  }, [text, filter]);
  return (
    <div className="ctx">
      <input
        className="ctx-filter"
        placeholder="filter context (regex)…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <pre className="ctx-body">{shown || "{}"}</pre>
    </div>
  );
}

export function Timeline({ events }: { events: string[] }) {
  if (!events.length) return <p className="muted">no events yet</p>;
  return (
    <ol className="timeline">
      {events
        .map((e, i) => ({ e, i }))
        .reverse()
        .map(({ e, i }) => (
          <li key={i}>
            <span className="tstep">{i + 1}</span>
            <span className="tname">{e}</span>
          </li>
        ))}
    </ol>
  );
}

export function EffectsPanel({
  timers,
  invocations,
  onFire,
  onResolve,
  onReject,
}: {
  timers: TimerInfo[];
  invocations: InvokeInfo[];
  onFire: (id: string) => void;
  onResolve: (id: string, output: string) => void;
  onReject: (id: string) => void;
}) {
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  if (!timers.length && !invocations.length) return null;
  return (
    <div className="effects">
      {timers.map((t) => (
        <div key={t.id} className="effect timer">
          <span>⏲ after {t.delay}</span>
          <button onClick={() => onFire(t.id)}>fire</button>
        </div>
      ))}
      {invocations.map((iv) => (
        <div key={iv.id} className="effect invoke">
          <span>⮞ invoke {iv.src}</span>
          <input
            placeholder='output JSON e.g. {"ok":true}'
            value={outputs[iv.id] ?? ""}
            onChange={(e) => setOutputs((o) => ({ ...o, [iv.id]: e.target.value }))}
          />
          <button onClick={() => onResolve(iv.id, outputs[iv.id] ?? "")}>resolve</button>
          <button className="danger" onClick={() => onReject(iv.id)}>reject</button>
        </div>
      ))}
    </div>
  );
}
