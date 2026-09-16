import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { NodeVM, ViewModel } from "../model/viewModel";
import { NODE_W, leafHeight } from "../model/sizing";

// Pure ViewModel → ELK graph spec. ELK does NODE PLACEMENT only here: connected
// nodes are placed near each other, but its computed edge routes are discarded —
// libavoid draws the edges from per-row anchors. Self-loops and global (badged)
// events are excluded from the ELK input so they don't distort placement.

export const ROOT_LAYOUT: Record<string, string> = {
  "elk.algorithm": "mrtree",
  "elk.direction": "RIGHT",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.spacing.nodeNode": "220",
  "elk.mrtree.compaction": "none",
  "elk.padding": "[top=80,left=80,bottom=80,right=80]",
};

// Container insets differ by role: parallel swimlanes and structural ghosts omit
// the 40px header, semantic compounds reserve room for it.
export function containerLayout(n: NodeVM): Record<string, string> {
  const { rfType, isLane, hasOwnTransitions } = n.cls;
  if (rfType === "parallel") {
    return { "elk.padding": "[top=60,left=60,bottom=60,right=60]", "elk.spacing.nodeNode": "80" };
  }
  if (isLane || !hasOwnTransitions) {
    return { "elk.padding": "[top=44,left=44,bottom=44,right=44]", "elk.spacing.nodeNode": "120" };
  }
  return { "elk.padding": "[top=64,left=56,bottom=56,right=56]", "elk.spacing.nodeNode": "120" };
}

// compact (label-only) mode shrinks leaves to a header band so the chart reads as
// a pure state-flow; fields mode sizes leaves for their transition rows.
export function buildElkSpec(vm: ViewModel, compact = false): ElkNode {
  const byParent = new Map<string, NodeVM[]>();
  for (const n of vm.nodes) {
    const arr = byParent.get(n.node.parent) ?? [];
    arr.push(n);
    byParent.set(n.node.parent, arr);
  }

  const make = (n: NodeVM): ElkNode => {
    const kids = byParent.get(n.node.id) ?? [];
    if (kids.length > 0) {
      return { id: n.node.id, layoutOptions: containerLayout(n), children: kids.map(make) };
    }
    if (n.node.type === "final")   return { id: n.node.id, width: 56, height: 56 };
    if (n.node.type === "history") return { id: n.node.id, width: 44, height: 44 };
    return { id: n.node.id, width: NODE_W, height: leafHeight(compact ? 0 : n.rows.length) };
  };

  return {
    id: "root",
    layoutOptions: ROOT_LAYOUT,
    children: (byParent.get("") ?? []).map(make),
    edges: vm.edges
      .filter((e) => !e.global && !e.selfLoop)
      .map((e) => ({ id: e.edge.id, sources: [e.edge.source], targets: [e.edge.target] })),
  };
}
