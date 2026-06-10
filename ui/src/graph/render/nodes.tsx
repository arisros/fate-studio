import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { useStudio } from "../studioCtx";
import {
  TARGET_HANDLE_ID,
  COMPACT_SOURCE_ID,
  rowHandleId,
  rowCenterY,
} from "../model/handles";
import type { FNode, RFNodeData } from "./types";

/** Clickable initial-state dot. Clicking fits the view to the node's bounding box. */
function InitialDot({ id }: { id: string }) {
  const rf = useReactFlow();
  return (
    <span
      className="dot-initial dot-initial--click"
      title="initial state — click to center"
      onClick={(e) => {
        e.stopPropagation();
        rf.fitView({ nodes: [{ id }], padding: 0.18, duration: 350 });
      }}
    />
  );
}

type P = NodeProps<FNode>;

const TargetHandle = () => (
  <Handle type="target" id={TARGET_HANDLE_ID} position={Position.Left} isConnectable={false} />
);

// Source handles: one per transition row in fields mode (aligned to the row), a
// single centered handle in compact mode. Rendered at node scope so React Flow
// positions them absolutely from the node top.
function SourceHandles({ data }: { data: RFNodeData }) {
  const rows = data.vm.rows;
  if (!rows.length) return null;
  if (data.compact) {
    return (
      <Handle type="source" id={COMPACT_SOURCE_ID} position={Position.Right} style={{ top: "50%" }} isConnectable={false} />
    );
  }
  return (
    <>
      {rows.map((r) => (
        <Handle
          key={r.edge.id}
          type="source"
          id={rowHandleId(r.edge.id)}
          position={Position.Right}
          // top is absolute px from node top; override transform to skip the
          // default -50% Y shift that React Flow applies when top is "50%".
          style={{ top: rowCenterY(r.index), transform: "translateX(calc(50% + 12px)) translateY(-50%)" }}
          isConnectable={false}
        />
      ))}
    </>
  );
}

function Header({ data }: { data: RFNodeData }) {
  const n = data.vm.node;
  return (
    <div className="nhead">
      {n.initial && <InitialDot id={n.id} />}
      <span className="nlabel">{n.label}</span>
      {n.type !== "atomic" && n.type !== "compound" && <span className={`ntype t-${n.type}`}>{n.type}</span>}
      {!data.compact && !!n.entry?.length && (
        <span className="nact" title="entry">
          ⏎{n.entry.join(",")}
        </span>
      )}
    </div>
  );
}

function Rows({ data }: { data: RFNodeData }) {
  const { sendable, interactive, onSend } = useStudio();
  if (data.compact || !data.vm.rows.length) return null;
  return (
    <div className="nrows">
      {data.vm.rows.map((r) => {
        const e = r.edge;
        const acts = (e.actions ?? []).filter((a) => a.trim() !== "");
        const can = interactive && data.activeLeaf && sendable.has(e.event);
        return (
          <div
            key={e.id}
            className={`erow${can ? " sendable" : ""}${r.selfLoop ? " self" : ""}${acts.length ? " has-acts" : ""}`}
            onClick={(ev) => {
              ev.stopPropagation();
              if (can) onSend(e.event);
            }}
            title={can ? `send ${e.event}` : undefined}
          >
            <div className="erow-top">
              <span className="ev">{e.event}</span>
              {e.guard && <span className="grd">[{e.guard}]</span>}
              {e.internal && <span className="intl">⟳</span>}
              {r.condMeta && <span className="gate-ind" title="has gate conditions">🔒</span>}
            </div>
            {acts.length > 0 && (
              <div className="erow-acts">/{acts.join(", ")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Badges({ data }: { data: RFNodeData }) {
  if (data.compact || !data.vm.badges.length) return null;
  return (
    <div className="nbadges">
      {data.vm.badges.map((ev) => (
        <span key={ev} className="badge-ev" title={`global transition: ${ev}`}>
          ⊗ {ev}
        </span>
      ))}
    </div>
  );
}

const cls = (data: RFNodeData, base: string) =>
  `${base}${data.active ? " active" : ""}${data.activeLeaf ? " leaf" : ""}`;

export function StateNode({ data }: P) {
  return (
    <div className={cls(data, "node state")}>
      <TargetHandle />
      <Header data={data} />
      <Rows data={data} />
      <Badges data={data} />
      <SourceHandles data={data} />
    </div>
  );
}

export function CompoundNode({ data }: P) {
  const n = data.vm.node;
  // Lane: direct child of a parallel → labelled swimlane region.
  if (data.vm.cls.isLane) {
    return (
      <div className={cls(data, "node compound lane")}>
        <TargetHandle />
        <div className="region-label">
          {n.initial && <InitialDot id={n.id} />}
          {n.label}
        </div>
        <Rows data={data} />
        <Badges data={data} />
        <SourceHandles data={data} />
      </div>
    );
  }
  // Ghost: structural grouping with no own transitions → minimal weight.
  if (!data.vm.cls.hasOwnTransitions) {
    return (
      <div className={cls(data, "node compound ghost")}>
        <TargetHandle />
        <span className="ghost-label">
          {n.initial && <InitialDot id={n.id} />}
          {n.label}
        </span>
        <Rows data={data} />
        <Badges data={data} />
        <SourceHandles data={data} />
      </div>
    );
  }
  // Semantic compound: has own transitions → prominent header box.
  return (
    <div className={cls(data, "node compound")}>
      <TargetHandle />
      <Header data={data} />
      <Rows data={data} />
      <Badges data={data} />
      <SourceHandles data={data} />
    </div>
  );
}

export function ParallelNode({ data }: P) {
  const n = data.vm.node;
  return (
    <div className={cls(data, "node parallel")}>
      <TargetHandle />
      <div className="swimlane-label">
        {n.initial && <InitialDot id={n.id} />}
        <span className="swimlane-icon">⊞</span>
        {n.label}
      </div>
      <SourceHandles data={data} />
    </div>
  );
}

export function FinalNode({ data }: P) {
  return (
    <div className={cls(data, "node final")} title={data.vm.node.label}>
      <TargetHandle />
      <div className="final-bullet">
        <span className="final-outer" />
        <span className="final-inner" />
      </div>
      <span className="final-label">{data.vm.node.label}</span>
    </div>
  );
}

export function HistoryNode({ data }: P) {
  return (
    <div className={cls(data, "node history")} title={`history (${data.vm.node.history ?? "shallow"})`}>
      <TargetHandle />
      <span className="hist">{data.vm.node.history === "deep" ? "H*" : "H"}</span>
      <SourceHandles data={data} />
    </div>
  );
}

export const nodeTypes = {
  state: StateNode,
  compound: CompoundNode,
  parallel: ParallelNode,
  final: FinalNode,
  history: HistoryNode,
};
