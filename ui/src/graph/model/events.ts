import type { Graph } from "../../types";

// eventsFromGraph lists the named events declared on any active state, the way
// the engine resolves them (a leaf and its ancestors). The simulator uses it
// when a frame does not carry the server's list.
export function eventsFromGraph(graph: Graph, activePaths: Set<string>): string[] {
  const pathById = new Map(graph.nodes.map((n) => [n.id, n.path]));
  const out = new Set<string>();
  for (const e of graph.edges) {
    if (e.event === "onDone" || e.event === "*") continue;
    if (activePaths.has(pathById.get(e.source) ?? "")) out.add(e.event);
  }
  return [...out].sort();
}
