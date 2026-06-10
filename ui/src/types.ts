// Mirrors the Go backend contracts:
//   Graph/GraphNode/GraphEdge  -> vendor/github.com/arisros/fate/graph.go
//   LiveSnapshot/Timer/Invoke  -> live.go
//   snapResponse               -> simulator.go
//   /api/machines              -> server.go (new endpoint)

export type NodeType =
  | "atomic"
  | "compound"
  | "parallel"
  | "final"
  | "history";

// CondField describes one predicate that a Guard checks on the actor context.
// Mirrors vendor/github.com/arisros/fate/cond_meta.go.
export interface CondField {
  path: string; // "$.score" or "$.customer.name"
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "truthy" | "falsy";
  value?: unknown;
  label?: string; // human display override
}

// CondMeta is informational metadata about what a transition Guard checks.
// Displayed as a live Gate panel in the studio inspector.
export interface CondMeta {
  fields?: CondField[];
  sample?: unknown; // example context object that passes the guard
}

export interface GraphNode {
  id: string; // qualified node id
  label: string; // leaf display name
  path: string; // dot-path (matches active-state path)
  type: NodeType;
  parent: string; // parent qualified id, "" if top-level
  initial: boolean;
  history?: "shallow" | "deep";
  entry?: string[];
  exit?: string[];
  uiStateSchema?: Record<string, unknown>; // JSON Schema for UIState return type
}

export interface GraphEdge {
  id: string;
  source: string;
  event: string;
  target: string;
  guard?: string;
  actions?: string[];
  internal?: boolean;
  condMeta?: CondMeta; // gate metadata for the studio inspector
}

export interface Graph {
  id: string;
  initial: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TimerInfo {
  id: string;
  delay: string;
}

export interface InvokeInfo {
  id: string;
  src: string;
}

export interface LiveSnapshot {
  path: string; // active dot-path(s), parallel joined by " | "
  context: unknown; // raw JSON
  status: string; // "running" | "stopped" | "done" | "error"
  ascii: string;
  uiState?: unknown; // per-state payload from Go StateNodeConfig.UIState callback
  timers?: TimerInfo[];
  invocations?: InvokeInfo[];
}

export interface SnapResponse extends LiveSnapshot {
  events: string[]; // events sendable from the active state
}

export interface MachineInfo {
  name: string;
  summary: string;
  live: boolean; // has a simulator (BuildLive != nil)
}
