import type { Edge, Node } from "@xyflow/react";
import type { NodeVM } from "../model/viewModel";
import type { Pt } from "../model/handles";

export interface RFNodeData extends Record<string, unknown> {
  vm: NodeVM;
  active: boolean; // node or an ancestor of the active leaf
  activeLeaf: boolean; // node is an active leaf (sendable origin)
  compact: boolean; // label-only show-mode
}

export interface RFEdgeData extends Record<string, unknown> {
  active: boolean; // source is an active leaf
  global: boolean; // badged hub event (hidden as a line by default)
  selfLoop: boolean; // drawn as an oval that exits the node
  event: string;
  points?: Pt[]; // libavoid route (absolute flow coords)
}

export type FNode = Node<RFNodeData>;
export type FEdge = Edge<RFEdgeData>;
