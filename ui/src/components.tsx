import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import type { InvokeInfo, SimStep, TimerInfo } from "./types";
import { TextInput } from "./forms";

export function StatusBadge({ status, conn }: { status: string; conn: string }) {
  const cls = status === "done" ? "done" : status === "error" ? "err" : conn === "open" ? "run" : "wait";
  return <span className={`badge ${cls}`}>{conn === "closed" ? "disconnected" : status}</span>;
}

export function ActivePath({ path }: { path: string }) {
  if (!path) return <code className="state-path">—</code>;
  return (
    <code className="state-path">
      {path.split(" | ").map((p, i) => {
        const cut = p.lastIndexOf(".") + 1;
        return (
          <span key={i} className="region">
            <span className="region-parents">{p.slice(0, cut)}</span>
            {p.slice(cut)}
          </span>
        );
      })}
    </code>
  );
}

interface CodeLine {
  text: string;
  key: string | null; // the top-level key the line belongs to
}

// contextLines pretty-prints the context one top-level key at a time, so each
// line knows which key it shows.
function contextLines(context: unknown): CodeLine[] {
  if (context === null || typeof context !== "object" || Array.isArray(context)) {
    return (JSON.stringify(context ?? {}, null, 2) ?? "").split("\n").map((text) => ({ text, key: null }));
  }
  const entries = Object.entries(context as Record<string, unknown>);
  if (!entries.length) return [{ text: "{}", key: null }];
  const lines: CodeLine[] = [{ text: "{", key: null }];
  entries.forEach(([key, value], n) => {
    const body = (JSON.stringify(value, null, 2) ?? "null").split("\n");
    body.forEach((part, i) => {
      const head = i === 0 ? `${JSON.stringify(key)}: ` : "";
      const tail = i === body.length - 1 && n < entries.length - 1 ? "," : "";
      lines.push({ text: `  ${head}${part}${tail}`, key });
    });
  });
  lines.push({ text: "}", key: null });
  return lines;
}

const jsonToken = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function JsonLine({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(jsonToken)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push(<span key={m.index} className="tok-key">{m[1]}</span>, m[2]);
    } else {
      const cls = m[1] ? "tok-str" : m[3] ? "tok-kw" : "tok-num";
      out.push(<span key={m.index} className={cls}>{m[0]}</span>);
    }
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

// useChangedKeys returns the top-level context keys the last frame changed.
function useChangedKeys(context: unknown): Set<string> {
  const prev = useRef<Record<string, string> | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  useEffect(() => {
    const now: Record<string, string> = {};
    if (context && typeof context === "object" && !Array.isArray(context)) {
      for (const [k, v] of Object.entries(context)) now[k] = JSON.stringify(v) ?? "";
    }
    const before = prev.current;
    prev.current = now;
    if (!before) return;
    const diff = new Set(Object.keys(now).filter((k) => now[k] !== before[k]));
    setChanged((old) => (diff.size || old.size ? diff : old));
  }, [context]);
  return changed;
}

export function ContextPanel({ context }: { context: unknown }) {
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => contextLines(context), [context]);
  const changed = useChangedKeys(context);
  const shown = useMemo(() => {
    if (!filter.trim()) return lines;
    let re: RegExp;
    try {
      re = new RegExp(filter, "i");
    } catch {
      return lines;
    }
    return lines.filter((l) => re.test(l.text));
  }, [lines, filter]);
  const copy = () => {
    void navigator.clipboard?.writeText(lines.map((l) => l.text).join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="ctx">
      <TextInput
        className="ctx-filter"
        placeholder="Filter with a regex"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="code-block">
        <button className="code-copy" onClick={copy} title="Copy the context as JSON" aria-label="Copy the context as JSON">
          <Icon name={copied ? "check" : "copy"} size={13} />
        </button>
        <pre className="ctx-body">
          {shown.map((l, i) => (
            <span key={i} className={l.key !== null && changed.has(l.key) ? "code-line changed" : "code-line"}>
              <JsonLine text={l.text} />
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}

const stepIcons: Record<SimStep["kind"], IconName> = { event: "play", timer: "clock", resolve: "check", reject: "close" };
const stepWords: Record<SimStep["kind"], string> = { event: "", timer: "timer ", resolve: "resolved ", reject: "rejected " };

// stepChange describes what a step did as the leaf states it left and entered,
// ignoring the parallel regions it did not touch.
function stepChange(step: SimStep): { from: string; to: string } | null {
  const leaf = (p: string) => p.slice(p.lastIndexOf(".") + 1);
  const before = step.from.split(" | ");
  const after = step.to.split(" | ");
  const left = before.filter((p) => !after.includes(p)).map(leaf);
  const entered = after.filter((p) => !before.includes(p)).map(leaf);
  if (!left.length && !entered.length) return null;
  return { from: left.join(", "), to: entered.join(", ") };
}

export function Timeline({ events, steps, canSend }: { events: string[]; steps?: SimStep[]; canSend: boolean }) {
  if (!events.length) {
    return (
      <div className="empty-note">
        <strong>No events yet</strong>
        <span>
          {canSend
            ? "Send one from Events, or click a highlighted row on the chart."
            : "This machine accepts no events from here."}
        </span>
      </div>
    );
  }
  const rows: SimStep[] =
    steps?.length === events.length ? steps : events.map((label) => ({ kind: "event", label, from: "", to: "" }));
  const width = String(rows.length).length;
  return (
    <ol className="timeline">
      {rows
        .map((step, i) => ({ step, i }))
        .reverse()
        .map(({ step, i }) => {
          const change = step.to ? stepChange(step) : null;
          return (
            <li key={i} className={i === rows.length - 1 ? "latest" : undefined} title={step.to ? `${step.from}\n→ ${step.to}` : undefined}>
              <span className="tstep">{String(i + 1).padStart(Math.max(2, width), "0")}</span>
              <Icon name={stepIcons[step.kind]} size={11} className="tkind" />
              <span className="tbody">
                <span className="tname">
                  {stepWords[step.kind]}
                  {step.label}
                </span>
                {step.to && (
                  <span className="tchange">
                    {change ? (
                      <>
                        {change.from} <Icon name="arrow-right" size={11} /> {change.to}
                      </>
                    ) : (
                      "no state change"
                    )}
                  </span>
                )}
              </span>
            </li>
          );
        })}
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
          <span className="effect-what">
            <Icon name="clock" /> after <code>{t.delay}</code>
          </span>
          <button className="btn small primary" onClick={() => onFire(t.id)}>
            <Icon name="play" size={11} />
            Fire
          </button>
        </div>
      ))}
      {invocations.map((iv) => (
        <div key={iv.id} className="effect invoke">
          <span className="effect-what">
            <Icon name="bolt" /> invoke <code>{iv.src}</code>
          </span>
          <TextInput
            code
            placeholder='Output JSON, such as {"ok":true}'
            value={outputs[iv.id] ?? ""}
            onChange={(e) => setOutputs((o) => ({ ...o, [iv.id]: e.target.value }))}
          />
          <div className="effect-actions">
            <button className="btn small primary" onClick={() => onResolve(iv.id, outputs[iv.id] ?? "")}>
              Resolve
            </button>
            <button className="btn small danger" onClick={() => onReject(iv.id)}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
