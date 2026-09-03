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
  // Event names sendable from the active configuration, resolved server-side.
  // The server walks each active leaf up through its ancestors the way the
  // engine does; deriving this from the graph client-side missed every event
  // declared on a compound parent and offered non-events like "onDone".
  events: string[];
  timers?: TimerInfo[];
  invocations?: InvokeInfo[];
}

// SimFrame is what both the SSE stream and the POST endpoints return: the
// actor snapshot plus session state the client cannot derive on its own.
export interface SimFrame extends LiveSnapshot {
  timeline: string[]; // steps applied in this session, oldest first
}

export type SnapResponse = SimFrame;

export interface MachineInfo {
  name: string;
  summary: string;
  live: boolean; // has a simulator (BuildLive != nil)
}
