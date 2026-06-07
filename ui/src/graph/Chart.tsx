import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
  type NodePositionChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "../types";
import { layoutGraph, toFlow, NODE_W, HEADER_H, type EdgeData, type StateNodeData, type Layout, type Positioned } from "./flow";
import { activeFromPath } from "./active";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import { initAvoid, AvoidRouter, type Rect, type EdgeMeta } from "./avoid";

interface Props {
  machine: string;
  graph: Graph;
  activePath: string;
  colorMode: "light" | "dark";
}

const posKey = (m: string) => `fate-pos-${m}`;

function loadOverrides(machine: string): Record<string, { x: number; y: number }> {
  try {
    return JSON.parse(localStorage.getItem(posKey(machine)) || "{}");
  } catch {
    return {};
  }
}

// Compute absolute rects from ELK layout (layout.pos stores relative positions).
function buildAbsRectsFromLayout(layout: Layout): Map<string, Rect> {
  const absOrigin = new Map<string, { x: number; y: number }>();
  absOrigin.set("", { x: 0, y: 0 }); // virtual root

  const remaining = new Map<string, Positioned>(layout.pos);
  while (remaining.size > 0) {
    const prev = remaining.size;
    for (const [id, p] of remaining) {
      const orig = absOrigin.get(p.parentId);
      if (orig !== undefined) {
        absOrigin.set(id, { x: orig.x + p.x, y: orig.y + p.y });
        remaining.delete(id);
      }
    }
    if (remaining.size === prev) break;
  }

  const rects = new Map<string, Rect>();
  for (const [id, p] of layout.pos) {
    const abs = absOrigin.get(id);
    if (abs) rects.set(id, { x: abs.x, y: abs.y, w: p.width, h: p.height });
  }
  return rects;
}

// Compute absolute rects from React Flow node state (child positions are parent-relative).
function absRectsFromNodes(ns: Node<StateNodeData>[]): Map<string, Rect> {
  const byId = new Map(ns.map(n => [n.id, n]));
  const cache = new Map<string, { x: number; y: number }>();

  function getAbs(n: Node<StateNodeData>): { x: number; y: number } {
    const hit = cache.get(n.id);
    if (hit) return hit;
    if (!n.parentId) {
      cache.set(n.id, n.position);
      return n.position;
    }
    const parent = byId.get(n.parentId);
    const parentAbs = parent ? getAbs(parent) : { x: 0, y: 0 };
    const r = { x: parentAbs.x + n.position.x, y: parentAbs.y + n.position.y };
    cache.set(n.id, r);
    return r;
  }

  const rects = new Map<string, Rect>();
  for (const n of ns) {
    const abs = getAbs(n);
    rects.set(n.id, {
      x: abs.x, y: abs.y,
      w: (n.style?.width as number) ?? NODE_W,
      h: (n.style?.height as number) ?? HEADER_H,
    });
  }
  return rects;
}

// Minimum gap between sibling nodes during drag.
const COLLISION_GAP = 8;

// Minimum-penetration-vector collision resolver (xyflow node-collision style).
// Pushes `pos` out of all overlapping siblings along the shortest axis.
function resolveCollisions(
  pos: { x: number; y: number },
  w: number,
  h: number,
  siblings: Node<StateNodeData>[],
): { x: number; y: number } {
  let { x, y } = pos;
  for (const sib of siblings) {
    const sw = (sib.style?.width as number) ?? NODE_W;
    const sh = (sib.style?.height as number) ?? HEADER_H;
    const sx = sib.position.x, sy = sib.position.y;
    const g = COLLISION_GAP;
    // Penetration depths on each side (positive = overlap exists on that side)
    const pR = x + w + g - sx;       // dragged right into sibling left
    const pL = sx + sw + g - x;      // sibling right into dragged left
    const pB = y + h + g - sy;       // dragged bottom into sibling top
    const pT = sy + sh + g - y;      // sibling bottom into dragged top
    if (pR <= 0 || pL <= 0 || pB <= 0 || pT <= 0) continue; // no overlap
    // Find minimum penetration axis and push out
    const minX = pR < pL ? -pR : pL;
    const minY = pB < pT ? -pB : pT;
    if (Math.abs(minX) <= Math.abs(minY)) x += minX;
    else                                   y += minY;
  }
  return { x, y };
}

function ChartInner({ machine, graph, activePath, colorMode }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StateNodeData>>([]);
  const [edges, setEdges] = useEdgesState<Edge<EdgeData>>([]);
  const [version, setVersion] = useState(0);
  const [globals, setGlobals] = useState<string[]>([]);
  const [showGlobals, setShowGlobals] = useState(false);
  const [compact, setCompact] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const active = useMemo(() => activeFromPath(activePath), [activePath]);

  // libavoid state
  const avoidRef    = useRef<AvoidRouter | null>(null);
  const nodeRectsRef = useRef<Map<string, Rect>>(new Map());
  const edgeMetaRef  = useRef<EdgeMeta[]>([]);
  const isDraggingRef = useRef(false);

  // Adjacency for hover focus highlight.
  const adj = useMemo(() => {
    const nbr = new Map<string, Set<string>>();
    const inc = new Map<string, Set<string>>();
    const add = (m: Map<string, Set<string>>, k: string, v: string) => {
      let s = m.get(k);
      if (!s) m.set(k, (s = new Set()));
      s.add(v);
    };
    for (const e of graph.edges) {
      add(nbr, e.source, e.target);
      add(nbr, e.target, e.source);
      add(inc, e.source, e.id);
      add(inc, e.target, e.id);
    }
    return { nbr, inc };
  }, [graph]);

  // Layout + libavoid initial routing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initAvoid();
      const layout = await layoutGraph(graph, compact);
      const overrides = loadOverrides(machine);
      for (const [id, o] of Object.entries(overrides)) {
        const p = layout.pos.get(id);
        if (p) layout.pos.set(id, { ...p, x: o.x, y: o.y });
      }
      if (cancelled) return;

      const { nodes: ns, edges: es } = toFlow(graph, layout, activeFromPath(activePath), compact);

      // Build absolute rects (ELK gives relative coords; flatten to absolute).
      const rects = buildAbsRectsFromLayout(layout);
      nodeRectsRef.current = rects;

      // Build edge metadata for router.
      const meta: EdgeMeta[] = es.map(e => ({
        id: e.id, source: e.source, target: e.target,
        selfLoop: e.data?.selfLoop, global: e.data?.global,
      }));
      edgeMetaRef.current = meta;

      // Create fresh router and route all edges via libavoid.
      avoidRef.current?.destroy();
      const router = new AvoidRouter();
      avoidRef.current = router;
      router.setShapes(rects);
      router.setConnectors(meta, rects);
      const routes = router.route();

      // Apply libavoid routes, overriding ELK's orthogonal routes.
      const routedEs = es.map(e => {
        const pts = routes.get(e.id);
        return pts ? { ...e, data: { ...e.data, points: pts } } as Edge<EdgeData> : e;
      });

      setNodes(ns);
      setEdges(routedEs.map(e => (e.data?.global ? { ...e, hidden: !showGlobals } : e)));
      setGlobals([...layout.globals]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, machine, version, compact]);

  // Re-route edges whenever nodes move (drag). isDraggingRef gates this so it
  // only fires during user drag, not on every unrelated nodes update.
  useEffect(() => {
    if (!isDraggingRef.current || !avoidRef.current) return;
    const router = avoidRef.current;
    const rects = absRectsFromNodes(nodes);
    nodeRectsRef.current = rects;
    router.setShapes(rects);
    router.updateAllEndpoints(edgeMetaRef.current, rects);
    const routes = router.route();
    setEdges(es => es.map(e => {
      const pts = routes.get(e.id);
      return pts ? { ...e, data: { ...e.data, points: pts } } as Edge<EdgeData> : e;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Re-apply active highlight + hover focus — no relayout needed.
  useEffect(() => {
    const focusNodes = hover ? new Set<string>([hover, ...(adj.nbr.get(hover) ?? [])]) : null;
    const focusEdges = hover ? adj.inc.get(hover) ?? new Set<string>() : null;
    const pathById = new Map(graph.nodes.map((g) => [g.id, g.path]));

    setNodes((ns: Node<StateNodeData>[]) =>
      ns.map((n: Node<StateNodeData>) => {
        const path = n.data.node.path;
        const cls = focusNodes ? (focusNodes.has(n.id) ? "hl" : "dim") : undefined;
        return {
          ...n,
          className: cls,
          data: { ...n.data, active: active.paths.has(path), activeLeaf: active.leaves.has(path) },
        };
      }),
    );
    setEdges((es: Edge<EdgeData>[]) =>
      es.map((e: Edge<EdgeData>) => {
        const on = active.leaves.has(pathById.get(e.source) ?? "");
        const focusCls = focusEdges ? (focusEdges.has(e.id) ? "hl" : "dim") : "";
        const cls = [on ? "edge-active" : "", focusCls].filter(Boolean).join(" ") || undefined;
        return { ...e, data: { ...e.data, active: on }, animated: on, className: cls };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hover]);

  const onNodeMouseEnter = useCallback((_e: unknown, node: Node<StateNodeData>) => setHover(node.id), []);
  const onNodeMouseLeave = useCallback(() => setHover(null), []);

  const handleChanges = (changes: NodeChange<Node<StateNodeData>>[]) => {
    // Collision resolution: for a single-node drag, push the dragged node out of
    // any sibling it overlaps so nodes never stack on top of each other.
    const dragChange = changes.find(
      (c): c is NodePositionChange => c.type === "position" && !!c.dragging && !!c.position
    );
    let resolved = changes;
    if (dragChange?.position) {
      const dragged = nodes.find(n => n.id === dragChange.id);
      if (dragged) {
        const w = (dragged.style?.width as number) ?? NODE_W;
        const h = (dragged.style?.height as number) ?? HEADER_H;
        const siblings = nodes.filter(n => n.id !== dragChange.id && n.parentId === dragged.parentId);
        const pos = resolveCollisions(dragChange.position as {x:number;y:number}, w, h, siblings);
        if (pos.x !== dragChange.position.x || pos.y !== dragChange.position.y) {
          resolved = changes.map(c => c === dragChange ? { ...c, position: pos } : c);
        }
      }
    }

    onNodesChange(resolved);

    // Track drag state so the routing effect knows when to fire.
    const anyDragging = changes.some(c => c.type === "position" && c.dragging);
    isDraggingRef.current = anyDragging;

    // Save positions on drag end.
    const dragEnd = changes.some(c => c.type === "position" && c.dragging === false);
    if (dragEnd) {
      isDraggingRef.current = false;
      requestAnimationFrame(() => {
        setNodes((ns: Node<StateNodeData>[]) => {
          const ov: Record<string, { x: number; y: number }> = {};
          for (const n of ns) ov[n.id] = { x: n.position.x, y: n.position.y };
          try { localStorage.setItem(posKey(machine), JSON.stringify(ov)); } catch { /* quota */ }
          return ns;
        });
      });
    }
  };

  const retidy = () => {
    try { localStorage.removeItem(posKey(machine)); } catch { /* ignore */ }
    setVersion(v => v + 1);
  };

  const toggleGlobals = () => {
    const next = !showGlobals;
    setShowGlobals(next);
    setEdges(es => es.map(e => (e.data?.global ? { ...e, hidden: !next } : e)));
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleChanges}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      colorMode={colorMode}
      fitView
      fitViewOptions={{ padding: 0.18, includeHiddenNodes: false }}
      minZoom={0.08}
      maxZoom={3}
      edgesReconnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Panel position="top-left">
        <div className="chart-toolbar">
          <div className="seg" role="group" aria-label="show mode">
            <button className={`seg-btn${compact ? "" : " on"}`} onClick={() => setCompact(false)} title="show action rows">
              fields
            </button>
            <button className={`seg-btn${compact ? " on" : ""}`} onClick={() => setCompact(true)} title="state names only">
              label
            </button>
          </div>
          <button className="retidy-btn" onClick={retidy} title="re-run auto-layout">↺ re-tidy</button>
        </div>
      </Panel>
      {globals.length > 0 && (
        <Panel position="top-right">
          <div className="globals-legend">
            <div className="gl-title">global events <span className="gl-count">{globals.length}</span></div>
            <div className="gl-chips">
              {globals.map(ev => <span key={ev} className="badge-ev">⊗ {ev}</span>)}
            </div>
            <label className="gl-toggle">
              <input type="checkbox" checked={showGlobals} onChange={toggleGlobals} />
              draw as edges
            </label>
          </div>
        </Panel>
      )}
      <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} className="mesh-bg" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n: Node) => {
          if (n.type === "parallel") return "rgba(194,239,78,0.30)";
          if (n.type === "final")    return "rgba(110,231,183,0.40)";
          return "rgba(255,255,255,0.08)";
        }}
        maskColor="rgba(0,0,0,0.60)"
      />
    </ReactFlow>
  );
}

export function Chart(props: Props) {
  return (
    <ReactFlowProvider>
      <ChartInner {...props} />
    </ReactFlowProvider>
  );
}
