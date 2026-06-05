// elkjs ships its bundled browser build without bundled type paths; declare it.
declare module "elkjs/lib/elk.bundled.js" {
  export interface ElkNode {
    id: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    children?: ElkNode[];
    edges?: ElkExtendedEdge[];
    layoutOptions?: Record<string, string>;
  }
  export interface ElkPoint {
    x: number;
    y: number;
  }
  export interface ElkEdgeSection {
    startPoint: ElkPoint;
    endPoint: ElkPoint;
    bendPoints?: ElkPoint[];
  }
  export interface ElkExtendedEdge {
    id: string;
    sources: string[];
    targets: string[];
    sections?: ElkEdgeSection[];
  }
  export default class ELK {
    constructor(opts?: unknown);
    layout(graph: ElkNode, opts?: unknown): Promise<ElkNode>;
  }
}
