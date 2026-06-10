import { useState } from "react";
import type { PendingDecision } from "../graph/sim/virtualSim";
import { evaluateGates } from "../graph/sim/gateEval";

interface Props {
  path: string;
  events: string[];
  pendingDecision: PendingDecision | null;
  onSend: (ev: string) => void;
  onDecide: (targetId: string) => void;
  onCancelDecision: () => void;
  onUndo: () => void;
  onReset: () => void;
  onClose: () => void;
  /** Live actor context for gate evaluation (optional). */
  context?: unknown;
}

export function VSimPanel({
  path,
  events,
  pendingDecision,
  onSend,
  onDecide,
  onCancelDecision,
  onUndo,
  onReset,
  onClose,
  context,
}: Props) {
  const [mockOpen, setMockOpen] = useState(false);
  const [mockRaw, setMockRaw] = useState("{}");

  let parsed: unknown = null;
  let parseErr = "";
  if (mockOpen) {
    try {
      parsed = JSON.parse(mockRaw);
    } catch (e) {
      parseErr = e instanceof Error ? e.message : "invalid JSON";
    }
  }

  // Context used for gate evaluation: live context if provided, else mock.
  const evalCtx = context ?? (parsed ?? null);

  return (
    <div className="vsim-panel">
      <div className="vsim-header">
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <span className="vsim-title">Virtual Sim</span>
          <span className="vsim-subtitle">guards not evaluated</span>
        </div>
        <button className="vsim-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="vsim-body">
        <div>
          <div className="vsim-label">Active state</div>
          <div className="vsim-path">{path || "—"}</div>
        </div>

        {/* Decision panel — replaces events list when send() produces multiple targets */}
        {pendingDecision ? (
          <DecisionPanel
            decision={pendingDecision}
            evalCtx={evalCtx}
            onDecide={onDecide}
            onCancel={onCancelDecision}
          />
        ) : (
          <div>
            <div className="vsim-label">Events</div>
            <div className="vsim-ev-btns">
              {events.map((ev) => (
                <button key={ev} className="ev-btn" onClick={() => onSend(ev)}>
                  {ev}
                </button>
              ))}
              {!events.length && <span className="muted">none from here</span>}
            </div>
          </div>
        )}

        <div className="vsim-actions">
          <button className="btn ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={onUndo}>
            ↩ undo
          </button>
          <button className="btn ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={onReset}>
            ↺ reset
          </button>
        </div>

        <div className="vsim-mock">
          <button className="vsim-mock-toggle" onClick={() => setMockOpen((v) => !v)}>
            {mockOpen ? "▾" : "▸"} Mock context
          </button>
          {mockOpen && (
            <>
              <textarea
                rows={4}
                value={mockRaw}
                onChange={(e) => setMockRaw(e.target.value)}
                placeholder='{"score": 65, "status": "approved"}'
              />
              {parseErr
                ? <span className="vsim-warn">⚠ {parseErr}</span>
                : <pre className="vsim-mock-preview">{JSON.stringify(parsed, null, 2)}</pre>
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Decision panel ───────────────────────────────────────────────────────────

function DecisionPanel({
  decision,
  evalCtx,
  onDecide,
  onCancel,
}: {
  decision: PendingDecision;
  evalCtx: unknown;
  onDecide: (targetId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="vsim-decision">
      <div className="vsim-decision-header">
        <span className="vsim-decision-icon">🔀</span>
        <span className="vsim-decision-title">
          <strong>{decision.event}</strong> — pick a branch
        </span>
      </div>
      <div className="vsim-decision-hint">
        Guards not evaluated — choose where to go:
      </div>
      <div className="vsim-decision-choices">
        {decision.choices.map((choice) => {
          const evals = choice.condMeta ? evaluateGates(choice.condMeta, evalCtx) : [];
          const allOpen = evals.length > 0 && evals.every((r) => r.status === "open");
          const anyClosed = evals.some((r) => r.status === "closed");
          const gateIcon = evals.length === 0
            ? null
            : anyClosed ? "🔒" : allOpen ? "🔓" : "❓";

          return (
            <button
              key={choice.targetId}
              className={`vsim-choice-btn${choice.isSelfLoop ? " self-loop" : ""}`}
              onClick={() => onDecide(choice.targetId)}
            >
              <span className="vsim-choice-label">
                {choice.isSelfLoop ? "↺" : "→"} {choice.label}
              </span>
              {gateIcon && (
                <span className="vsim-choice-gate" title="gate status">{gateIcon}</span>
              )}
              {evals.length > 0 && (
                <span className="vsim-choice-fields">
                  {evals.map((r, i) => (
                    <span
                      key={i}
                      className={`vsim-field-dot dot-${r.status}`}
                      title={`${r.field.label ?? r.field.path} ${r.field.op} ${r.field.value ?? ""} (actual: ${r.actual ?? "—"})`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {decision.choices.some((c) => c.condMeta?.sample) && (
        <SampleHints choices={decision.choices} />
      )}
      <button
        className="btn ghost"
        style={{ fontSize: 11, marginTop: 6, width: "100%" }}
        onClick={onCancel}
      >
        cancel
      </button>
    </div>
  );
}

function SampleHints({ choices }: { choices: PendingDecision["choices"] }) {
  const [open, setOpen] = useState(false);
  const withSample = choices.filter((c) => c.condMeta?.sample);
  if (!withSample.length) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <button className="vsim-mock-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "▾" : "▸"} sample contexts
      </button>
      {open && (
        <div style={{ marginTop: 4 }}>
          {withSample.map((c) => (
            <div key={c.targetId} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>
                → {c.label}
              </div>
              <pre className="vsim-mock-preview">
                {JSON.stringify(c.condMeta!.sample, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
