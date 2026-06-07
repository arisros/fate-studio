import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { Graph, GraphEdge, GraphNode } from "../types";

const elk = new ELK();

export const NODE_W = 230;
export const ROW_H = 26;
export const HEADER_H = 40;
export const PAD = 10;

export interface StateNodeData extends Record<string, unknown> {
  node: GraphNode;
  rows: GraphEdge[]; // outgoing NON-global transitions, shown as rows
  badges: string[]; // global events emitted by this node (shown as chips)
  isContainer: boolean;
  active: boolean;
  activeLeaf: boolean;
  compact: boolean; // show-mode: label-only (true) vs fields/actions (false)
  hasOwnTransitions: boolean; // false = structural wrapper (ghost/lane rendering)
  isLane: boolean; // true = direct child of a parallel state (swimlane region)
}

export interface EdgeData extends Record<string, unknown> {
  active: boolean;
  global?: boolean; // a near-global event (badged, hidden as a line by default)
  event?: string;
  points?: Pt[]; // ELK-routed orthogonal bend points (absolute flow coords)
  selfLoop?: boolean; // source === target (internal/cyclic transition)
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
  compact: boolean,
): ElkNode {
  // Nodes that appear as edge sources have own transitions → semantic containers.
  // Containers with no edge sources are structural groupings → ghost/lane rendering.
  const edgeSources = new Set(graph.edges.filter((e) => !globals.has(e.event)).map((e) => e.source));
  const nodeTypeById = new Map<string, string>(graph.nodes.map((n) => [n.id, n.type as string]));

  const make = (n: GraphNode): ElkNode => {
    const children = kids.get(n.id) ?? [];
    const isContainer = children.length > 0;
    if (isContainer) {
      const isParallel = n.type === "parallel";
      const parentType = n.parent ? nodeTypeById.get(n.parent) : undefined;
      const isLane = parentType === "parallel"; // direct child of a parallel = swimlane region
      const isStructural = !edgeSources.has(n.id); // no own transitions = ghost/lane container

      // Parallel swimlane containers and structural ghost wrappers omit the 36px
      // header, so they need much less top-padding than semantic compound nodes.
      let padding: string;
      let nodeSpacing: string;
      if (isParallel) {
        padding = "[top=36,left=24,bottom=24,right=24]";
        nodeSpacing = "20";
      } else if (isLane || isStructural) {
        padding = "[top=28,left=18,bottom=18,right=18]";
        nodeSpacing = "36";
      } else {
        padding = "[top=48,left=22,bottom=22,right=22]"; // 40px header + 8px gap
        nodeSpacing = "40";
      }

      return {
        id: n.id,
        layoutOptions: {
          "elk.padding": padding,
          "elk.spacing.nodeNode": nodeSpacing,
        },
        children: children.map(make),
      };
    }
    // Compact (label-only) mode shrinks leaves to just their header so the
    // chart reads as a pure state-flow; fields mode sizes for the action rows.
    const r = compact ? 0 : (rows.get(n.id) ?? []).filter((e) => !globals.has(e.event)).length;
    return { id: n.id, width: NODE_W, height: leafHeight(r) };
  };
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      // Horizontal (left-to-right) flow, like an ERD — reads as a pipeline.
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      // Orthogonal routing with bend points → clean, non-overlapping wires that
      // the custom edge follows (instead of React Flow's straight beziers).
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "70",
      "elk.layered.spacing.edgeNodeBetweenLayers": "55",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "28",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.padding": "[top=32,left=32,bottom=32,right=32]",
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
// compact (label-only show-mode) sizes leaves to their header.
export async function layoutGraph(graph: Graph, compact = false): Promise<Layout> {
  const kids = childrenOf(graph);
  const rows = rowsBySource(graph);
  const globals = new Set(detectGlobalEvents(graph));
  const res = await elk.layout(buildElk(graph, kids, rows, globals, compact));
  const { pos, edgePts } = flatten(res);
  return { pos, edgePts, globals };
}

export function toFlow(
  graph: Graph,
  layout: Layout,
  active: { paths: Set<string>; leaves: Set<string> },
  compact = false,
): FlowResult {
  const pos = layout.pos;
  const kids = childrenOf(graph);
  const rows = rowsBySource(graph);

  // Parent nodes must precede children in the array for React Flow.
  const ordered = [...graph.nodes].sort((a, b) => depth(a) - depth(b));

  const gset = layout.globals;
  const edgeSources = new Set(graph.edges.map((e) => e.source));
  const parallelIds = new Set(graph.nodes.filter((n) => n.type === "parallel").map((n) => n.id));

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
        compact,
        hasOwnTransitions: edgeSources.has(n.id),
        isLane: n.parent ? parallelIds.has(n.parent) : false,
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
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      // Global edges are hidden by default (badged on the node instead) and get
      // no ELK route — they render as a plain bezier if the user toggles them on.
      hidden: isGlobal,
      data: {
        active: sourceActive,
        global: isGlobal,
        event: e.event,
        points: isGlobal ? undefined : layout.edgePts.get(e.id),
        selfLoop: e.source === e.target,
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
