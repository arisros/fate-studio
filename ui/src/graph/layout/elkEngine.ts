import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { ViewModel } from "../model/viewModel";
import { buildElkSpec } from "./elkSpec";
import { NODE_W, leafHeight } from "../model/sizing";
import type { Rect } from "../model/handles";

// Runs ELK and flattens its nested, parent-relative result into two maps:
//   • rel — parent-relative positions, fed straight into React Flow node.position
//   • abs — absolute rects, fed to the libavoid router as obstacles/anchors
// ELK runs once per layout / re-tidy (not per frame), so it stays on the main
// thread behind this async boundary; swapping in a worker later is transparent.

export interface RelPos {
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string;
}

export interface LayoutResult {
  rel: Map<string, RelPos>;
  abs: Map<string, Rect>;
  width: number;
  height: number;
}

const elk = new ELK();

export async function runLayout(vm: ViewModel, compact = false): Promise<LayoutResult> {
  const res = await elk.layout(buildElkSpec(vm, compact));
  return flatten(res);
}

export function flatten(root: ElkNode): LayoutResult {
  const rel = new Map<string, RelPos>();
  const abs = new Map<string, Rect>();
  const walk = (n: ElkNode, parentId: string, baseX: number, baseY: number) => {
    const nx = n.x ?? 0;
    const ny = n.y ?? 0;
    const ax = baseX + nx;
    const ay = baseY + ny;
    if (n.id !== "root") {
      const w = n.width ?? NODE_W;
      const h = n.height ?? leafHeight(0);
      rel.set(n.id, { x: nx, y: ny, width: w, height: h, parentId });
      abs.set(n.id, { x: ax, y: ay, w, h });
    }
    for (const c of n.children ?? []) walk(c, n.id === "root" ? "" : n.id, ax, ay);
  };
  walk(root, "", 0, 0);
  return { rel, abs, width: root.width ?? 0, height: root.height ?? 0 };
}

// Recompute absolute rects from React Flow's parent-relative node state during a
// drag (child positions are relative to their parent's origin).
export function absFromRel(
  nodes: { id: string; parentId?: string; position: { x: number; y: number }; width: number; height: number }[],
): Map<string, Rect> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cache = new Map<string, { x: number; y: number }>();
  const origin = (id: string): { x: number; y: number } => {
    const hit = cache.get(id);
    if (hit) return hit;
    const n = byId.get(id)!;
    const base = n.parentId ? origin(n.parentId) : { x: 0, y: 0 };
    const p = { x: base.x + n.position.x, y: base.y + n.position.y };
    cache.set(id, p);
    return p;
  };
  const abs = new Map<string, Rect>();
  for (const n of nodes) {
    const o = origin(n.id);
    abs.set(n.id, { x: o.x, y: o.y, w: n.width, h: n.height });
  }
  return abs;
}
