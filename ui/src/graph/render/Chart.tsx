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
  type Node,
  type NodeChange,
  type NodePositionChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "../../types";
import { activeFromPath } from "../active";
import { buildViewModel } from "../model/viewModel";
import { NODE_W, leafHeight } from "../model/sizing";
import type { Rect } from "../model/handles";
import { runLayout, absFromRel } from "../layout/elkEngine";
import { initRouter, AvoidRouter } from "../routing/router";
import { resolveCollisions, type Box } from "./collision";
import { buildNodes, buildEdges, buildRouterEdges } from "./build";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import type { FNode, FEdge } from "./types";

export interface ChartProps {
  machine: string;
  graph: Graph;
  activePath: string;
  colorMode: "light" | "dark";
}
type Props = ChartProps;

const posKey = (m: string) => `fate-pos-${m}`;

function loadOverrides(machine: string): Record<string, { x: number; y: number }> {
  try {
    return JSON.parse(localStorage.getItem(posKey(machine)) || "{}");
  } catch {
    return {};
  }
}

const nodeW = (n: FNode) => (n.style?.width as number) ?? NODE_W;
const nodeH = (n: FNode) => (n.style?.height as number) ?? leafHeight(0);

/** Absolute rects from React Flow node state (child positions are parent-relative). */
function absOf(ns: FNode[]): Map<string, Rect> {
  return absFromRel(
    ns.map((n) => ({ id: n.id, parentId: n.parentId, position: n.position, width: nodeW(n), height: nodeH(n) })),
  );
}

function ChartInner({ machine, graph, activePath, colorMode }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FNode>([]);
  const [edges, setEdges] = useEdgesState<FEdge>([]);
  const [version, setVersion] = useState(0);
  const [globals, setGlobals] = useState<string[]>([]);
  const [showGlobals, setShowGlobals] = useState(false);
  const [compact, setCompact] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  const vm = useMemo(() => buildViewModel(graph), [graph]);
  const active = useMemo(() => activeFromPath(activePath), [activePath]);

  const routerRef = useRef<AvoidRouter | null>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const nodesRef = useRef<FNode[]>([]);
  nodesRef.current = nodes;

  // Hover-focus adjacency.
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

  // Layout + initial routing. Re-runs on graph/machine/compact change or re-tidy.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initRouter();
      const layout = await runLayout(vm, compact);
      if (cancelled) return;

      const overrides = loadOverrides(machine);
      for (const [id, o] of Object.entries(overrides)) {
        const p = layout.rel.get(id);
        if (p) layout.rel.set(id, { ...p, x: o.x, y: o.y });
      }

      const ns = buildNodes(vm, layout.rel, active, compact);
      const es = buildEdges(vm, active, compact);
      const abs = absOf(ns);

      // Only leaf nodes (not containers) are libavoid obstacles — containers are
      // visual groupings and registering them blocks cross-container routes.
      const containerIds = new Set(vm.nodes.filter((n) => n.cls.isContainer).map((n) => n.node.id));
      const leafAbs = new Map([...abs.entries()].filter(([id]) => !containerIds.has(id)));

      routerRef.current?.destroy();
      const router = new AvoidRouter();
      routerRef.current = router;
      router.setScene(leafAbs, abs, buildRouterEdges(vm, abs, compact));
      const routes = router.route();

      const routed = es.map((e) =>
        routes.has(e.id) ? ({ ...e, data: { ...e.data!, points: routes.get(e.id) } } as FEdge) : e,
      );
      if (cancelled) return;
      setNodes(ns);
      setEdges(routed.map((e) => (e.data?.global ? { ...e, hidden: !showGlobals } : e)));
      setGlobals(vm.globals);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm, machine, version, compact]);

  // Re-route on drag — rAF-coalesced so libavoid runs at most once per frame.
  useEffect(() => {
    if (!isDraggingRef.current || !routerRef.current) return;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const r = routerRef.current;
      if (!r) return;
      r.sync(absOf(nodesRef.current));
      const routes = r.route();
      setEdges((es) => es.map((e) => (routes.has(e.id) ? ({ ...e, data: { ...e.data!, points: routes.get(e.id) } } as FEdge) : e)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Active highlight + hover focus — no relayout.
  useEffect(() => {
    const focusNodes = hover ? new Set<string>([hover, ...(adj.nbr.get(hover) ?? [])]) : null;
    const focusEdges = hover ? adj.inc.get(hover) ?? new Set<string>() : null;
    const pathById = new Map(graph.nodes.map((g) => [g.id, g.path]));

    setNodes((ns) =>
      ns.map((n) => {
        const path = n.data.vm.node.path;
        const className = focusNodes ? (focusNodes.has(n.id) ? "hl" : "dim") : undefined;
        return { ...n, className, data: { ...n.data, active: active.paths.has(path), activeLeaf: active.leaves.has(path) } };
      }),
    );
    setEdges((es) =>
      es.map((e) => {
        const on = active.leaves.has(pathById.get(e.source) ?? "");
        const focusCls = focusEdges ? (focusEdges.has(e.id) ? "hl" : "dim") : "";
        const className = [on ? "edge-active" : "", focusCls].filter(Boolean).join(" ") || undefined;
        return { ...e, data: { ...e.data!, active: on }, animated: on, className };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hover]);

  const onNodeMouseEnter = useCallback((_e: unknown, node: Node) => setHover(node.id), []);
  const onNodeMouseLeave = useCallback(() => setHover(null), []);

  const handleChanges = (changes: NodeChange<FNode>[]) => {
    // Collision: push a dragged node out of any sibling it overlaps.
    const dragChange = changes.find(
      (c): c is NodePositionChange => c.type === "position" && !!c.dragging && !!c.position,
    );
    let resolved = changes;
    if (dragChange?.position) {
      const dragged = nodes.find((n) => n.id === dragChange.id);
      if (dragged) {
        const siblings: Box[] = nodes
          .filter((n) => n.id !== dragChange.id && n.parentId === dragged.parentId)
          .map((n) => ({ x: n.position.x, y: n.position.y, w: nodeW(n), h: nodeH(n) }));
        const pos = resolveCollisions(dragChange.position, nodeW(dragged), nodeH(dragged), siblings);
        if (pos.x !== dragChange.position.x || pos.y !== dragChange.position.y) {
          resolved = changes.map((c) => (c === dragChange ? { ...c, position: pos } : c));
        }
      }
    }

    onNodesChange(resolved);
    isDraggingRef.current = changes.some((c) => c.type === "position" && c.dragging);

    const dragEnd = changes.some((c) => c.type === "position" && c.dragging === false);
    if (dragEnd) {
      isDraggingRef.current = false;
      requestAnimationFrame(() => {
        setNodes((ns) => {
          const ov: Record<string, { x: number; y: number }> = {};
          for (const n of ns) ov[n.id] = { x: n.position.x, y: n.position.y };
          try {
            localStorage.setItem(posKey(machine), JSON.stringify(ov));
          } catch {
            /* quota */
          }
          return ns;
        });
      });
    }
  };

  const retidy = () => {
    try {
      localStorage.removeItem(posKey(machine));
    } catch {
      /* ignore */
    }
    setVersion((v) => v + 1);
  };

  const toggleGlobals = () => {
    const next = !showGlobals;
    setShowGlobals(next);
    setEdges((es) => es.map((e) => (e.data?.global ? { ...e, hidden: !next } : e)));
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
      minZoom={0.15}
      maxZoom={3}
      edgesReconnectable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Panel position="top-left">
        <div className="chart-toolbar">
          <div className="seg" role="group" aria-label="show mode">
            <button className={`seg-btn${compact ? " on" : ""}`} onClick={() => setCompact(true)} title="state names only — clean overview">
              overview
            </button>
            <button className={`seg-btn${compact ? "" : " on"}`} onClick={() => setCompact(false)} title="show transition rows and actions">
              detail
            </button>
          </div>
          <button className="retidy-btn" onClick={retidy} title="re-run auto-layout">
            ↺ re-tidy
          </button>
        </div>
      </Panel>
      {globals.length > 0 && (
        <Panel position="top-right">
          <div className="globals-legend">
            <div className="gl-title">
              global events <span className="gl-count">{globals.length}</span>
            </div>
            <div className="gl-chips">
              {globals.map((ev) => (
                <span key={ev} className="badge-ev">
                  ⊗ {ev}
                </span>
              ))}
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
          if (n.type === "final") return "rgba(110,231,183,0.40)";
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
