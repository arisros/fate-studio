import { useState } from "react";
import { Icon, gateIcon } from "../icons";
import { TextArea } from "../forms";
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
          <span className="vsim-title">Virtual sim</span>
          <span className="vsim-subtitle">guards not run; gates checked against the context</span>
        </div>
        <button className="vsim-close" onClick={onClose} title="Close"><Icon name="close" /></button>
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
              {!events.length && <span className="muted">None from here</span>}
            </div>
          </div>
        )}

        <div className="vsim-actions">
          <button className="btn ghost" onClick={onUndo}>
            <Icon name="undo" />Undo
          </button>
          <button className="btn ghost" onClick={onReset}>
            <Icon name="reset" />Reset
          </button>
        </div>

        <div className="vsim-mock">
          <button className="vsim-mock-toggle" onClick={() => setMockOpen((v) => !v)}>
            <Icon name={mockOpen ? "chevron-down" : "chevron-right"} size={12} /> Mock context
          </button>
          {mockOpen && (
            <>
              <TextArea
                code
                rows={4}
                invalid={!!parseErr}
                value={mockRaw}
                onChange={(e) => setMockRaw(e.target.value)}
                placeholder='{"score": 65, "status": "approved"}'
              />
              {parseErr
                ? <span className="vsim-warn"><Icon name="warning" size={12} /> {parseErr}</span>
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
        <Icon name="branch" className="vsim-decision-icon" />
        <span className="vsim-decision-title">
          <strong>{decision.event}</strong>: pick a branch
        </span>
      </div>
      <div className="vsim-decision-hint">
        Guards are not run, so choose where to go:
      </div>
      <div className="vsim-decision-choices">
        {decision.choices.map((choice) => {
          const evals = choice.condMeta ? evaluateGates(choice.condMeta, evalCtx) : [];
          const allOpen = evals.length > 0 && evals.every((r) => r.status === "open");
          const anyClosed = evals.some((r) => r.status === "closed");
          const gate = evals.length === 0 ? null : gateIcon(anyClosed, allOpen);

          return (
            <button
              key={choice.targetId}
              className={`vsim-choice-btn${choice.isSelfLoop ? " self-loop" : ""}`}
              onClick={() => onDecide(choice.targetId)}
            >
              <span className="vsim-choice-label">
                <Icon name={choice.isSelfLoop ? "loop" : "arrow-right"} size={12} /> {choice.label}
              </span>
              {gate && (
                <span className="vsim-choice-gate" title="gate status">
                  <Icon name={gate} size={12} />
                </span>
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
        style={{ marginTop: 6, width: "100%" }}
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
        <Icon name={open ? "chevron-down" : "chevron-right"} size={12} /> Sample contexts
      </button>
      {open && (
        <div style={{ marginTop: 4 }}>
          {withSample.map((c) => (
            <div key={c.targetId} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>
                <Icon name="arrow-right" size={11} /> {c.label}
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
