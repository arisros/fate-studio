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
  rows: GraphEdge[]; // outgoing transitions, shown as rows
  isContainer: boolean;
  active: boolean;
  activeLeaf: boolean;
}

export interface EdgeData extends Record<string, unknown> {
  active: boolean;
  points?: Pt[]; // ELK-routed orthogonal bend points (absolute flow coords)
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
    const r = (rows.get(n.id) ?? []).length;
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
    edges: graph.edges.map((e) => ({
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
}

function flatten(root: ElkNode): Layout {
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

// layoutGraph runs ELK and returns node positions + routed edge points.
export async function layoutGraph(graph: Graph): Promise<Layout> {
  const kids = childrenOf(graph);
  const rows = rowsBySource(graph);
  const res = await elk.layout(buildElk(graph, kids, rows));
  return flatten(res);
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

  const nodes: Node<StateNodeData>[] = ordered.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0, width: NODE_W, height: leafHeight(0), parentId: n.parent };
    const isContainer = (kids.get(n.id) ?? []).length > 0;
    return {
      id: n.id,
      type: nodeKind(n, isContainer),
      position: { x: p.x, y: p.y },
      parentId: n.parent || undefined,
      extent: n.parent ? "parent" : undefined,
      style: { width: p.width, height: p.height },
      data: {
        node: n,
        rows: rows.get(n.id) ?? [],
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
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "transition",
      label: edgeLabel(e),
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      data: { active: sourceActive, points: layout.edgePts.get(e.id) },
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
