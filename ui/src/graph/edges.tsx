import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { EdgeData } from "./flow";

// TransitionEdge: bezier for normal edges, a rounded self-loop for
// source===target. Label floats at the midpoint; active edges are styled.
export function TransitionEdge(props: EdgeProps<Edge<EdgeData>>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    markerEnd,
    data,
    source,
    target,
  } = props;

  const selfLoop = source === target;
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (selfLoop) {
    const off = 60;
    edgePath = `M ${sourceX} ${sourceY} C ${sourceX + off} ${sourceY + off}, ${targetX + off} ${targetY - off}, ${targetX} ${targetY}`;
    labelX = sourceX + off;
    labelY = (sourceY + targetY) / 2;
  } else {
    const [p, lx, ly] =
      Math.abs(targetY - sourceY) < 8
        ? getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
        : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    edgePath = p;
    labelX = lx;
    labelY = ly;
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} className={data?.active ? "rf-edge active" : "rf-edge"} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${data?.active ? " active" : ""}`}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { transition: TransitionEdge };
