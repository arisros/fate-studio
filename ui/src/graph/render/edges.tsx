import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { Pt } from "../model/handles";
import type { FEdge } from "./types";

// roundedPath builds an SVG path through libavoid's orthogonal route with small
// rounded corners — clean "wired" routing that never crosses a node.
function roundedPath(pts: Pt[], r = 8): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    const next = pts[i + 1];
    const v1 = norm(p.x - prev.x, p.y - prev.y);
    const v2 = norm(next.x - p.x, next.y - p.y);
    const d1 = Math.min(r, dist(prev, p) / 2);
    const d2 = Math.min(r, dist(p, next) / 2);
    const a = { x: p.x - v1.x * d1, y: p.y - v1.y * d1 };
    const b = { x: p.x + v2.x * d2, y: p.y + v2.y * d2 };
    d += ` L ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function norm(x: number, y: number): Pt {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}
function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function TransitionEdge(props: EdgeProps<FEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data } = props;

  let edgePath: string;

  if (data?.selfLoop) {
    // Self-loop: compact oval that exits the node's right face and returns.
    const loopW = 40;
    const loopH = 26;
    edgePath = [
      `M ${sourceX} ${sourceY - loopH / 2}`,
      `C ${sourceX + loopW} ${sourceY - loopH / 2}`,
      `  ${sourceX + loopW} ${sourceY + loopH / 2}`,
      `  ${sourceX} ${sourceY + loopH / 2}`,
    ].join(" ");
  } else if (data?.points && data.points.length >= 2) {
    edgePath = roundedPath(data.points);
  } else {
    const [p] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    edgePath = p;
  }

  return (
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} className={data?.active ? "rf-edge active" : "rf-edge"} />
  );
}

export const edgeTypes = { transition: TransitionEdge };
