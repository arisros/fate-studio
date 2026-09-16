import type { Graph, GraphNode } from "../../types";

// Node classification: maps a statechart node to a React Flow node-type plus the
// flags that drive its rendering variant. Pure functions over precomputed sets so
// they're trivially unit-testable.

export type RFType = "state" | "compound" | "parallel" | "final" | "history";

export interface ClassifyCtx {
  childCount: Map<string, number>; // id → number of direct children
  parallelIds: Set<string>; // ids of parallel nodes
  edgeSources: Set<string>; // ids that originate at least one non-global edge
}

export interface Classification {
  rfType: RFType;
  isContainer: boolean; // has children
  isLane: boolean; // direct child of a parallel (swimlane region)
  hasOwnTransitions: boolean; // originates a non-global transition
}

/** Build the lookup sets a classification needs from the raw graph. */
export function classifyCtx(graph: Graph, globals: Set<string>): ClassifyCtx {
  const childCount = new Map<string, number>();
  for (const n of graph.nodes) {
    childCount.set(n.parent, (childCount.get(n.parent) ?? 0) + 1);
  }
  const parallelIds = new Set(graph.nodes.filter((n) => n.type === "parallel").map((n) => n.id));
  const edgeSources = new Set(graph.edges.filter((e) => !globals.has(e.event)).map((e) => e.source));
  return { childCount, parallelIds, edgeSources };
}

export function classifyNode(n: GraphNode, ctx: ClassifyCtx): Classification {
  const isContainer = (ctx.childCount.get(n.id) ?? 0) > 0;
  const isLane = n.parent ? ctx.parallelIds.has(n.parent) : false;
  const hasOwnTransitions = ctx.edgeSources.has(n.id);
  let rfType: RFType;
  if (n.type === "final") rfType = "final";
  else if (n.type === "history") rfType = "history";
  else if (n.type === "parallel") rfType = "parallel";
  else rfType = isContainer ? "compound" : "state";
  return { rfType, isContainer, isLane, hasOwnTransitions };
}
