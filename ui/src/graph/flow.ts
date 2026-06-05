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
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      "elk.spacing.nodeNode": "36",
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
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

function flatten(root: ElkNode): Map<string, Positioned> {
  const out = new Map<string, Positioned>();
  const walk = (n: ElkNode, parentId: string) => {
    if (n.id !== "root") {
      out.set(n.id, {
        x: n.x ?? 0,
        y: n.y ?? 0,
        width: n.width ?? NODE_W,
        height: n.height ?? leafHeight(0),
        parentId,
      });
    }
    for (const c of n.children ?? []) walk(c, n.id === "root" ? "" : n.id);
  };
  walk(root, "");
  return out;
}

export interface FlowResult {
  nodes: Node<StateNodeData>[];
  edges: Edge<EdgeData>[];
}

// layoutGraph runs ELK and returns positions. Manual overrides (localStorage)
// are applied by the caller after this.
export async function layoutGraph(graph: Graph): Promise<Map<string, Positioned>> {
  const kids = childrenOf(graph);
  const rows = rowsBySource(graph);
  const res = await elk.layout(buildElk(graph, kids, rows));
  return flatten(res);
}

export function toFlow(
  graph: Graph,
  pos: Map<string, Positioned>,
  active: { paths: Set<string>; leaves: Set<string> },
): FlowResult {
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
      data: { active: sourceActive },
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
