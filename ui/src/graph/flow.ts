import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { Graph, GraphEdge, GraphNode } from "../types";

const elk = new ELK();

export const NODE_W = 230;
export const ROW_H = 24;
export const HEADER_H = 36;
export const PAD = 10;

export interface StateNodeData extends Record<string, unknown> {
  node: GraphNode;
  rows: GraphEdge[]; // outgoing NON-global transitions, shown as rows
  badges: string[]; // global events emitted by this node (shown as chips)
  isContainer: boolean;
  active: boolean;
  activeLeaf: boolean;
}

export interface EdgeData extends Record<string, unknown> {
  active: boolean;
  global?: boolean; // a near-global event (badged, hidden as a line by default)
  event?: string;
  points?: Pt[]; // ELK-routed orthogonal bend points (absolute flow coords)
}

// detectGlobalEvents finds the high-degree transitions whose lines clutter the
// chart — and badges them on nodes instead of drawing them. Two patterns:
//   • convergent (many sources → ≤2 targets): a global sink like TERMINATE.
//   • divergent  (≤2 sources → many targets): a hub like DETOUR_BACK / reassign.
// A backbone chain (FORWARD: many → many) is many-to-many and is NOT badged.
export function detectGlobalEvents(graph: Graph): string[] {
  const src = new Map<string, Set<string>>();
  const tgt = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    s.add(v);
  };
  for (const e of graph.edges) {
    add(src, e.event, e.source);
    add(tgt, e.event, e.target);
  }
  const states = new Set(graph.edges.map((e) => e.source)).size;
  const T = Math.max(6, Math.ceil(0.4 * states));
  const out: string[] = [];
  for (const ev of src.keys()) {
    const s = src.get(ev)!.size;
    const t = tgt.get(ev)!.size;
    const convergent = s >= T && t <= 2;
    const divergent = t >= T && s <= 2;
    if (convergent || divergent) out.push(ev);
  }
  return out.sort();
}

function leafHeight(rows: number): number {
  return HEADER_H + rows * ROW_H + PAD;
}

function childrenOf(graph: Graph): Map<string, GraphNode[]> {
  const m = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    const arr = m.get(n.parent) ?? [];
    arr.push(n);
    m.set(n.parent, arr);
  }
  return m;
}

function rowsBySource(graph: Graph): Map<string, GraphEdge[]> {
  const m = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    const arr = m.get(e.source) ?? [];
    arr.push(e);
    m.set(e.source, arr);
  }
  return m;
}

function buildElk(
  graph: Graph,
  kids: Map<string, GraphNode[]>,
  rows: Map<string, GraphEdge[]>,
  globals: Set<string>,
): ElkNode {
  const make = (n: GraphNode): ElkNode => {
    const children = kids.get(n.id) ?? [];
    const isContainer = children.length > 0;
    if (isContainer) {
      return {
        id: n.id,
        layoutOptions: {
          "elk.padding": "[top=42,left=14,bottom=14,right=14]",
          "elk.spacing.nodeNode": "28",
        },
        children: children.map(make),
      };
    }
    const r = (rows.get(n.id) ?? []).filter((e) => !globals.has(e.event)).length;
    return { id: n.id, width: NODE_W, height: leafHeight(r) };
  };
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      // Orthogonal routing with bend points → clean, non-overlapping wires that
      // the custom edge follows (instead of React Flow's straight beziers).
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.nodeNode": "46",
      "elk.layered.spacing.edgeNodeBetweenLayers": "26",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
    },
    children: (kids.get("") ?? []).map(make),
    // Exclude global events from layout so ELK packs nodes tightly (their
    // many-to-one fan would otherwise blow the layout apart).
    edges: graph.edges
      .filter((e) => !globals.has(e.event))
      .map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
  };
}

export interface Positioned {
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Layout {
  pos: Map<string, Positioned>;
  edgePts: Map<string, Pt[]>; // routed bend points, absolute flow coords
  globals: Set<string>; // near-global events (badged, not laid out)
}

function flatten(root: ElkNode): { pos: Map<string, Positioned>; edgePts: Map<string, Pt[]> } {
  const pos = new Map<string, Positioned>();
  const edgePts = new Map<string, Pt[]>();
  // baseX/baseY = absolute origin of n's container; n.x/n.y are relative to it.
  const walk = (n: ElkNode, parentId: string, baseX: number, baseY: number) => {
    const absX = baseX + (n.x ?? 0);
    const absY = baseY + (n.y ?? 0);
    if (n.id !== "root") {
      pos.set(n.id, {
        x: n.x ?? 0,
        y: n.y ?? 0,
        width: n.width ?? NODE_W,
        height: n.height ?? leafHeight(0),
        parentId,
      });
    }
    // Edges declared in this node: section coords are relative to n's origin.
    for (const e of n.edges ?? []) {
      const sec = e.sections?.[0];
      if (!sec) continue;
      const raw = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint];
      edgePts.set(
        e.id,
        raw.map((p) => ({ x: absX + p.x, y: absY + p.y })),
      );
    }
    for (const c of n.children ?? []) walk(c, n.id === "root" ? "" : n.id, absX, absY);
  };
  walk(root, "", 0, 0);
  return { pos, edgePts };
}

export interface FlowResult {
  nodes: Node<StateNodeData>[];
  edges: Edge<EdgeData>[];
}

// layoutGraph runs ELK and returns node positions + routed edge points. Global
// events are excluded from layout (they're badged, not drawn by default).
export async function layoutGraph(graph: Graph): Promise<Layout> {
  const kids = childrenOf(graph);
  const rows = rowsBySource(graph);
  const globals = new Set(detectGlobalEvents(graph));
  const res = await elk.layout(buildElk(graph, kids, rows, globals));
  const { pos, edgePts } = flatten(res);
  return { pos, edgePts, globals };
}

export function toFlow(
  graph: Graph,
  layout: Layout,
  active: { paths: Set<string>; leaves: Set<string> },
): FlowResult {
  const pos = layout.pos;
  const kids = childrenOf(graph);
  const rows = rowsBySource(graph);

  // Parent nodes must precede children in the array for React Flow.
  const ordered = [...graph.nodes].sort((a, b) => depth(a) - depth(b));

  const gset = layout.globals;

  const nodes: Node<StateNodeData>[] = ordered.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0, width: NODE_W, height: leafHeight(0), parentId: n.parent };
    const isContainer = (kids.get(n.id) ?? []).length > 0;
    const all = rows.get(n.id) ?? [];
    return {
      id: n.id,
      type: nodeKind(n, isContainer),
      position: { x: p.x, y: p.y },
      parentId: n.parent || undefined,
      extent: n.parent ? "parent" : undefined,
      style: { width: p.width, height: p.height },
      data: {
        node: n,
        rows: all.filter((e) => !gset.has(e.event)),
        badges: [...new Set(all.filter((e) => gset.has(e.event)).map((e) => e.event))].sort(),
        isContainer,
        active: active.paths.has(n.path),
        activeLeaf: active.leaves.has(n.path),
      },
      draggable: true,
      selectable: true,
    };
  });

  const edges: Edge<EdgeData>[] = graph.edges.map((e) => {
    const sourceActive = active.leaves.has(nodePath(graph, e.source));
    const isGlobal = gset.has(e.event);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "transition",
      label: edgeLabel(e),
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      // Global edges are hidden by default (badged on the node instead) and get
      // no ELK route — they render as a plain bezier if the user toggles them on.
      hidden: isGlobal,
      data: {
        active: sourceActive,
        global: isGlobal,
        event: e.event,
        points: isGlobal ? undefined : layout.edgePts.get(e.id),
      },
      animated: sourceActive,
      className: sourceActive ? "edge-active" : undefined,
      zIndex: 10,
    };
  });

  return { nodes, edges };
}

function nodeKind(n: GraphNode, isContainer: boolean): string {
  if (n.type === "final") return "final";
  if (n.type === "history") return "history";
  if (n.type === "parallel") return "parallel";
  return isContainer ? "compound" : "state";
}

function edgeLabel(e: GraphEdge): string {
  let s = e.event;
  if (e.guard) s += ` [${e.guard}]`;
  if (e.actions && e.actions.length) s += ` /${e.actions.join(",")}`;
  if (e.internal) s += " ⟳";
  return s;
}

function depth(n: GraphNode): number {
  return n.path.split(".").length;
}

function nodePath(graph: Graph, id: string): string {
  return graph.nodes.find((n) => n.id === id)?.path ?? "";
}
