import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { HANDLE_GAP, type Pt } from "../model/handles";
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

// Handles are invisible and sit outside the node, so the line is stretched to the border.
const HANDLE_R = 5;
const ARROW_L = 9;
const ARROW_W = 4.5;

function arrowPath(tip: Pt, dir: Pt): string {
  const bx = tip.x - dir.x * ARROW_L;
  const by = tip.y - dir.y * ARROW_L;
  return `M ${tip.x} ${tip.y} L ${bx - dir.y * ARROW_W} ${by + dir.x * ARROW_W} L ${bx + dir.y * ARROW_W} ${by - dir.x * ARROW_W} Z`;
}

const back = (tip: Pt, dir: Pt, by: number): Pt => ({ x: tip.x - dir.x * by, y: tip.y - dir.y * by });

export function TransitionEdge(props: EdgeProps<FEdge>) {
  const { id, sourceY, targetY, sourcePosition, targetPosition, data } = props;
  const sourceX = props.sourceX - HANDLE_GAP - HANDLE_R;
  const targetX = props.targetX + HANDLE_GAP + HANDLE_R;

  let edgePath: string;
  let tip: Pt;
  let dir: Pt = { x: 1, y: 0 };

  if (data?.selfLoop) {
    // Self-loop: compact oval that exits the node's right face and returns.
    const loopW = 40;
    const loopH = 26;
    tip = { x: sourceX, y: sourceY + loopH / 2 };
    dir = { x: -1, y: 0 };
    const end = back(tip, dir, ARROW_L / 2);
    edgePath = [
      `M ${sourceX} ${sourceY - loopH / 2}`,
      `C ${sourceX + loopW} ${sourceY - loopH / 2}`,
      `  ${sourceX + loopW} ${sourceY + loopH / 2}`,
      `  ${end.x} ${end.y}`,
    ].join(" ");
  } else if (data?.points && data.points.length >= 2) {
    const pts = data.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    tip = { x: last.x + HANDLE_GAP, y: last.y };
    edgePath = roundedPath([{ x: first.x - HANDLE_GAP, y: first.y }, ...pts.slice(1, -1), back(tip, dir, ARROW_L / 2)]);
  } else {
    tip = { x: targetX, y: targetY };
    const end = back(tip, dir, ARROW_L / 2);
    const [p] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX: end.x, targetY: end.y, targetPosition });
    edgePath = p;
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} className={data?.active ? "rf-edge active" : "rf-edge"} />
      <path className={data?.active ? "rf-arrow active" : "rf-arrow"} d={arrowPath(tip, dir)} />
    </>
  );
}

export const edgeTypes = { transition: TransitionEdge };
