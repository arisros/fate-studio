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
      {!!node.entry?.length && <span className="nact" title="entry">⏎{node.entry.join(",")}</span>}
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
      <Handle type="target" position={Position.Top} />
      <Header data={data} />
      <Rows data={data} />
      <Badges data={data} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function CompoundNode({ data }: P) {
  return (
    <div className={`node compound${data.active ? " active" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <Header data={data} />
      <Rows data={data} />
      <Badges data={data} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function ParallelNode({ data }: P) {
  return (
    <div className={`node parallel${data.active ? " active" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <Header data={data} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function FinalNode({ data }: P) {
  return (
    <div className={`node final${data.active ? " active" : ""}`} title={data.node.label}>
      <Handle type="target" position={Position.Top} />
      <span className="final-ring" />
      <span className="final-label">{data.node.label}</span>
    </div>
  );
}

export function HistoryNode({ data }: P) {
  return (
    <div className={`node history${data.active ? " active" : ""}`} title={`history (${data.node.history ?? "shallow"})`}>
      <Handle type="target" position={Position.Top} />
      <span className="hist">{data.node.history === "deep" ? "H*" : "H"}</span>
      <Handle type="source" position={Position.Bottom} />
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
