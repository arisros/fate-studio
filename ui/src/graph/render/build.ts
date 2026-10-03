import type { ViewModel } from "../model/viewModel";
import type { RelPos } from "../layout/elkEngine";
import type { ActiveSet } from "../active";
import type { Rect } from "../model/handles";
import { HEADER_H, NODE_W, leafHeight } from "../model/sizing";
import { TARGET_HANDLE_ID, sourceHandleId, sourceDy } from "../model/handles";
import type { RouterEdge } from "../routing/router";
import type { FNode, FEdge } from "./types";

// Pure builders: ViewModel + ELK layout → React Flow nodes/edges, and the router
// edge list with precomputed source-anchor offsets. No DOM, no side effects.

export function buildNodes(
  vm: ViewModel,
  rel: Map<string, RelPos>,
  active: ActiveSet,
  compact: boolean,
): FNode[] {
  return vm.nodes.map((n) => {
    const p =
      rel.get(n.node.id) ??
      ({ x: 0, y: 0, width: NODE_W, height: leafHeight(0), parentId: n.node.parent } as RelPos);
    const path = n.node.path;
    return {
      id: n.node.id,
      type: n.cls.rfType,
      position: { x: p.x, y: p.y },
      parentId: n.node.parent || undefined,
      extent: n.node.parent ? "parent" : undefined,
      style: { width: p.width, height: p.height },
      data: {
        vm: n,
        active: active.paths.has(path),
        activeLeaf: active.leaves.has(path),
        compact,
      },
      draggable: true,
      selectable: true,
    };
  });
}

export function buildEdges(vm: ViewModel, active: ActiveSet, compact: boolean): FEdge[] {
  const pathById = new Map(vm.graph.nodes.map((g) => [g.id, g.path]));
  return vm.edges.map((e) => {
    const srcActive = active.paths.has(pathById.get(e.edge.source) ?? "");
    return {
      id: e.edge.id,
      source: e.edge.source,
      target: e.edge.target,
      sourceHandle: sourceHandleId(e.edge.id, compact),
      targetHandle: TARGET_HANDLE_ID,
      type: "transition",
      // In compact/overview mode: hide self-loops (structural noise) and drop
      // edge labels so the flow diagram stays uncluttered.
      hidden: e.global || (compact && e.selfLoop),
      zIndex: 10,
      animated: srcActive,
      data: {
        active: srcActive,
        global: e.global,
        selfLoop: e.selfLoop,
        event: e.edge.event,
      },
    };
  });
}

/** libavoid edges (non-global, non-self) with their precomputed source Y offsets. */
export function buildRouterEdges(vm: ViewModel, abs: Map<string, Rect>, compact: boolean): RouterEdge[] {
  const out: RouterEdge[] = [];
  for (const e of vm.edges) {
    if (e.global || e.selfLoop) continue;
    const sr = abs.get(e.edge.source);
    if (!sr) continue;
    out.push({
      id: e.edge.id,
      source: e.edge.source,
      target: e.edge.target,
      srcDy: sourceDy(e.sourceRowIndex, sr.h, compact),
    });
  }
  return out;
}

/** Shapes the router keeps edges out of: every leaf, plus the header band of a
 *  compound that has one, so an edge never runs through a container's title.
 *  Whole containers are not obstacles, edges must be able to enter them. */
export function buildObstacles(vm: ViewModel, abs: Map<string, Rect>): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const n of vm.nodes) {
    const r = abs.get(n.node.id);
    if (!r) continue;
    if (!n.cls.isContainer) out.set(n.node.id, r);
    else if (n.cls.rfType === "compound" && !n.cls.isLane && n.cls.hasOwnTransitions) {
      out.set(`${n.node.id}#header`, { x: r.x, y: r.y, w: r.w, h: HEADER_H });
    }
  }
  return out;
}
