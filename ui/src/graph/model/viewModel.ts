import type { CondMeta, Graph, GraphEdge, GraphNode } from "../../types";
import { detectGlobalEvents } from "./globals";
import { classifyCtx, classifyNode, type Classification } from "./classify";

// The ViewModel is the single intermediate representation the layout, routing and
// render layers all consume. It is a pure function of the backend Graph JSON, so
// every derivation here is unit-tested against real machine fixtures.

export interface RowVM {
  edge: GraphEdge; // one outgoing, non-global transition
  index: number; // row position within the node (drives handle Y)
  selfLoop: boolean; // source === target
  label: string; // event [guard] /actions ⟳
  condMeta?: CondMeta; // gate conditions for the inspector, when declared
}

export interface NodeVM {
  node: GraphNode;
  cls: Classification;
  rows: RowVM[]; // outgoing non-global transitions, ordered
  badges: string[]; // global events emitted by this node
}

export interface EdgeVM {
  edge: GraphEdge;
  global: boolean; // badged, hidden as a line by default
  selfLoop: boolean; // drawn as an oval that exits the node
  sourceRowIndex: number; // which row this edge leaves from (handle/anchor Y)
}

export interface ViewModel {
  graph: Graph;
  nodes: NodeVM[]; // ordered parent-before-child (React Flow requirement)
  edges: EdgeVM[];
  globals: string[];
}

/** Human-readable transition label, dropping empty action placeholders. */
export function edgeLabel(e: GraphEdge): string {
  let s = e.event;
  if (e.guard) s += ` [${e.guard}]`;
  const acts = (e.actions ?? []).filter((a) => a.trim() !== "");
  if (acts.length) s += ` /${acts.join(",")}`;
  if (e.internal) s += " ⟳";
  return s;
}

function depth(n: GraphNode): number {
  return n.path.split(".").length;
}

export function buildViewModel(graph: Graph): ViewModel {
  const globalsArr = detectGlobalEvents(graph);
  const globals = new Set(globalsArr);
  const ctx = classifyCtx(graph, globals);

  // Outgoing edges grouped by source, in graph order. Each non-global edge is a
  // row; its index within the source node fixes its output-handle Y.
  const outBySource = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    const arr = outBySource.get(e.source) ?? [];
    arr.push(e);
    outBySource.set(e.source, arr);
  }

  const rowIndexByEdge = new Map<string, number>();
  const nodes: NodeVM[] = [...graph.nodes]
    .sort((a, b) => depth(a) - depth(b))
    .map((node) => {
      const out = outBySource.get(node.id) ?? [];
      const rows: RowVM[] = [];
      const badges = new Set<string>();
      let i = 0;
      for (const e of out) {
        if (globals.has(e.event)) {
          badges.add(e.event);
          continue;
        }
        rowIndexByEdge.set(e.id, i);
        rows.push({
          edge: e,
          index: i,
          selfLoop: e.source === e.target,
          label: edgeLabel(e),
          condMeta: e.condMeta,
        });
        i++;
      }
      return { node, cls: classifyNode(node, ctx), rows, badges: [...badges].sort() };
    });

  const edges: EdgeVM[] = graph.edges.map((e) => ({
    edge: e,
    global: globals.has(e.event),
    selfLoop: e.source === e.target,
    sourceRowIndex: rowIndexByEdge.get(e.id) ?? 0,
  }));

  return { graph, nodes, edges, globals: globalsArr };
}
