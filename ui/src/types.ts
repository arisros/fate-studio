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
}

export interface GraphEdge {
  id: string;
  source: string;
  event: string;
  target: string;
  guard?: string;
  actions?: string[];
  internal?: boolean;
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
