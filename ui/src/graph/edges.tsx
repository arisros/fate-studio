import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { EdgeData, Pt } from "./flow";

// roundedPath builds an SVG path through ELK's orthogonal bend points with
// small rounded corners — clean "wired" routing that avoids node overlaps.
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
function mid(pts: Pt[]): Pt {
  return pts[Math.floor(pts.length / 2)] ?? pts[0];
}

export function TransitionEdge(props: EdgeProps<Edge<EdgeData>>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd, data } = props;

  const pts = data?.points;
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (pts && pts.length >= 2) {
    // Follow ELK's routed wire.
    edgePath = roundedPath(pts);
    const m = mid(pts);
    labelX = m.x;
    labelY = m.y;
  } else {
    const [p, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
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
