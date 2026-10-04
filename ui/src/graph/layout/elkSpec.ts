import type { ElkExtendedEdge, ElkNode, ElkPort } from "elkjs/lib/elk-api";
import type { NodeVM, ViewModel } from "../model/viewModel";
import { HEADER_H, NODE_W, ROW_H, leafHeight } from "../model/sizing";
import { COMPACT_SOURCE_ID, TARGET_HANDLE_ID, rowHandleId, sourceDy } from "../model/handles";
import { IDEAL_NUDGE, ROUTER_PAD, SHAPE_BUFFER } from "../routing/libavoidConfig";

// Pure ViewModel → ELK graph spec. ELK does NODE PLACEMENT only: its edge routes
// are discarded and libavoid draws the edges. ELK still has to see every edge and
// where it attaches, otherwise it places nodes with no room for the router.

// The router anchors ROUTER_PAD outside both nodes, so two nodes joined by an edge
// need more than 2 * ROUTER_PAD between them, plus room for nudged parallel runs.
export const LAYER_GAP = 2 * ROUTER_PAD + 3 * IDEAL_NUDGE;
export const ROW_GAP = 2 * SHAPE_BUFFER + IDEAL_NUDGE;

const LAYERED: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_GAP),
  "elk.spacing.nodeNode": String(ROW_GAP),
  "elk.spacing.componentComponent": String(ROW_GAP),
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  // Children are fed in flow order (see flowOrder), so a transition that points
  // backwards in that order is the one drawn as a back edge.
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
};

export const ROOT_LAYOUT: Record<string, string> = {
  ...LAYERED,
  "elk.padding": "[top=80,left=80,bottom=80,right=80]",
};

// Container insets differ by role: parallel swimlanes and structural ghosts omit
// the 40px header, semantic compounds reserve room for it and for their own rows.
export function containerLayout(n: NodeVM): Record<string, string> {
  const { rfType, isLane, hasOwnTransitions } = n.cls;
  if (rfType === "parallel") {
    // Regions have no edges between them: one component keeps them stacked in a single layer.
    return { ...LAYERED, "elk.padding": "[top=60,left=60,bottom=60,right=60]", "elk.separateConnectedComponents": "false" };
  }
  if (isLane || !hasOwnTransitions) {
    return { ...LAYERED, "elk.padding": "[top=44,left=44,bottom=44,right=44]" };
  }
  const top = HEADER_H + n.rows.length * ROW_H + 24;
  return { ...LAYERED, "elk.padding": `[top=${top},left=56,bottom=56,right=56]` };
}

/** Breadth-first from the initial child, so layers follow the order states are reached. */
export function flowOrder(kids: NodeVM[], edges: ElkExtendedEdge[], owner: (endpoint: string) => string): NodeVM[] {
  const next = new Map<string, string[]>();
  for (const e of edges) {
    const s = owner(e.sources[0]);
    const arr = next.get(s) ?? [];
    arr.push(owner(e.targets[0]));
    next.set(s, arr);
  }
  const byId = new Map(kids.map((k) => [k.node.id, k]));
  const seen = new Set<string>();
  const out: NodeVM[] = [];
  const visit = (start: NodeVM) => {
    const queue = [start.node.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      out.push(byId.get(id)!);
      queue.push(...(next.get(id) ?? []));
    }
  };
  for (const k of kids) if (k.node.initial) visit(k);
  for (const k of kids) visit(k);
  // Final states are sinks: keep them out of the early layers.
  return [...out.filter((k) => k.node.type !== "final"), ...out.filter((k) => k.node.type === "final")];
}

const portId = (node: string, handle: string) => `${node}|${handle}`;

function leafPorts(n: NodeVM, height: number, compact: boolean): ElkPort[] {
  const id = n.node.id;
  const west: ElkPort = {
    id: portId(id, TARGET_HANDLE_ID),
    x: 0,
    y: height / 2,
    width: 0,
    height: 0,
    layoutOptions: { "elk.port.side": "WEST" },
  };
  const east = (handle: string, y: number): ElkPort => ({
    id: portId(id, handle),
    x: NODE_W,
    y,
    width: 0,
    height: 0,
    layoutOptions: { "elk.port.side": "EAST" },
  });
  if (compact) return [west, east(COMPACT_SOURCE_ID, height / 2)];
  return [west, ...n.rows.map((r) => east(rowHandleId(r.edge.id), sourceDy(r.index, height, false)))];
}

// compact (label-only) mode shrinks leaves to a header band so the chart reads as
// a pure state-flow; fields mode sizes leaves for their transition rows.
export function buildElkSpec(vm: ViewModel, compact = false): ElkNode {
  const byId = new Map(vm.nodes.map((n) => [n.node.id, n]));
  const byParent = new Map<string, NodeVM[]>();
  for (const n of vm.nodes) {
    const arr = byParent.get(n.node.parent) ?? [];
    arr.push(n);
    byParent.set(n.node.parent, arr);
  }
  const isLeaf = (id: string) => (byParent.get(id) ?? []).length === 0;

  // ELK lays out each container on its own, so an edge is declared in the lowest
  // container holding both ends, between the two children of that container.
  const chain = (id: string): string[] => {
    const out: string[] = [];
    for (let cur = id; cur; cur = byId.get(cur)?.node.parent ?? "") out.unshift(cur);
    return out;
  };
  const edgesIn = new Map<string, ElkExtendedEdge[]>();
  for (const e of vm.edges) {
    if (e.selfLoop) continue;
    const s = chain(e.edge.source);
    const t = chain(e.edge.target);
    let i = 0;
    while (i < s.length && i < t.length && s[i] === t[i]) i++;
    if (i >= s.length || i >= t.length) continue; // one end contains the other
    const owner = i === 0 ? "" : s[i - 1];
    const src = s[i];
    const dst = t[i];
    const srcPort =
      src === e.edge.source && isLeaf(src) && byId.get(src)!.node.type !== "final" && byId.get(src)!.node.type !== "history"
        ? compact
          ? portId(src, COMPACT_SOURCE_ID)
          : e.global
            ? undefined
            : portId(src, rowHandleId(e.edge.id))
        : undefined;
    const dstPort =
      dst === e.edge.target && isLeaf(dst) && byId.get(dst)!.node.type === "atomic"
        ? portId(dst, TARGET_HANDLE_ID)
        : undefined;
    const arr = edgesIn.get(owner) ?? [];
    arr.push({ id: e.edge.id, sources: [srcPort ?? src], targets: [dstPort ?? dst] });
    edgesIn.set(owner, arr);
  }

  const endpointNode = (endpoint: string) => endpoint.split("|")[0];
  const ordered = (parent: string): NodeVM[] => {
    const kids = byParent.get(parent) ?? [];
    if (byId.get(parent)?.cls.rfType === "parallel") return kids;
    return flowOrder(kids, edgesIn.get(parent) ?? [], endpointNode);
  };

  const make = (n: NodeVM): ElkNode => {
    const kids = ordered(n.node.id);
    if (kids.length > 0) {
      return {
        id: n.node.id,
        layoutOptions: { ...containerLayout(n), ...(n.cls.isLane ? { "elk.alignment": "LEFT" } : {}) },
        children: kids.map(make),
        edges: edgesIn.get(n.node.id) ?? [],
      };
    }
    if (n.node.type === "final") return { id: n.node.id, width: 56, height: 56 };
    if (n.node.type === "history") return { id: n.node.id, width: 44, height: 44 };
    const height = compact ? leafHeight(0) : leafHeight(n.rows.length, n.badges.length > 0);
    return {
      id: n.node.id,
      width: NODE_W,
      height,
      ports: leafPorts(n, height, compact),
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
    };
  };

  return {
    id: "root",
    layoutOptions: ROOT_LAYOUT,
    children: ordered("").map(make),
    edges: edgesIn.get("") ?? [],
  };
}
