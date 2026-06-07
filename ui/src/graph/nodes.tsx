import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { StateNodeData } from "./flow";
import { useStudio } from "./studioCtx";

type P = NodeProps<Node<StateNodeData>>;

function Header({ data }: { data: StateNodeData }) {
  const { node } = data;
  return (
    <div className="nhead">
      {node.initial && <span className="dot-initial" title="initial" />}
      <span className="nlabel">{node.label}</span>
      {node.type !== "atomic" && node.type !== "compound" && (
        <span className={`ntype t-${node.type}`}>{node.type}</span>
      )}
      {!data.compact && !!node.entry?.length && (
        <span className="nact" title="entry">⏎{node.entry.join(",")}</span>
      )}
    </div>
  );
}

function Badges({ data }: { data: StateNodeData }) {
  if (!data.badges.length) return null;
  return (
    <div className="nbadges">
      {data.badges.map((ev) => (
        <span key={ev} className="badge-ev" title={`global transition: ${ev}`}>
          ⊗ {ev}
        </span>
      ))}
    </div>
  );
}

function Rows({ data }: { data: StateNodeData }) {
  const { sendable, interactive, onSend } = useStudio();
  if (!data.rows.length) return null;
  return (
    <div className="nrows">
      {data.rows.map((e) => {
        const can = interactive && data.activeLeaf && sendable.has(e.event);
        return (
          <div
            key={e.id}
            className={`erow${can ? " sendable" : ""}`}
            onClick={(ev) => {
              ev.stopPropagation();
              if (can) onSend(e.event);
            }}
            title={can ? `send ${e.event}` : undefined}
          >
            <span className="ev">{e.event}</span>
            {e.guard && <span className="grd">[{e.guard}]</span>}
            {e.internal && <span className="intl">⟳</span>}
          </div>
        );
      })}
    </div>
  );
}

export function StateNode({ data }: P) {
  return (
    <div className={`node state${data.active ? " active" : ""}${data.activeLeaf ? " leaf" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Header data={data} />
      {!data.compact && <Rows data={data} />}
      {!data.compact && <Badges data={data} />}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function CompoundNode({ data }: P) {
  // Lane: direct child of a parallel — render as a labelled swimlane region.
  if (data.isLane) {
    return (
      <div className={`node compound lane${data.active ? " active" : ""}`}>
        <Handle type="target" position={Position.Left} />
        <div className="region-label">{data.node.label}</div>
        {!data.compact && <Rows data={data} />}
        {!data.compact && <Badges data={data} />}
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }
  // Ghost: structural grouping with no own transitions — minimal visual weight.
  if (!data.hasOwnTransitions) {
    return (
      <div className={`node compound ghost${data.active ? " active" : ""}`}>
        <Handle type="target" position={Position.Left} />
        <span className="ghost-label">{data.node.label}</span>
        {!data.compact && <Rows data={data} />}
        {!data.compact && <Badges data={data} />}
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }
  // Semantic compound: has own transitions → prominent header box.
  return (
    <div className={`node compound${data.active ? " active" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Header data={data} />
      {!data.compact && <Rows data={data} />}
      {!data.compact && <Badges data={data} />}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function ParallelNode({ data }: P) {
  return (
    <div className={`node parallel${data.active ? " active" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="swimlane-label">
        <span className="swimlane-icon">⊞</span>
        {data.node.label}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function FinalNode({ data }: P) {
  return (
    <div className={`node final${data.active ? " active" : ""}`} title={data.node.label}>
      <Handle type="target" position={Position.Left} />
      <span className="final-ring" />
      <span className="final-label">{data.node.label}</span>
    </div>
  );
}

export function HistoryNode({ data }: P) {
  return (
    <div className={`node history${data.active ? " active" : ""}`} title={`history (${data.node.history ?? "shallow"})`}>
      <Handle type="target" position={Position.Left} />
      <span className="hist">{data.node.history === "deep" ? "H*" : "H"}</span>
      <Handle type="source" position={Position.Right} />
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
