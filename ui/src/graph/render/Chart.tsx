import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../icons";
import { Checkbox } from "../../forms";
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
  useOnViewportChange,
  useReactFlow,
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
import { buildNodes, buildEdges, buildObstacles, buildRouterEdges } from "./build";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import type { FNode, FEdge } from "./types";
import { boundsOf, fitViewport, labelScale } from "../model/fit";
import { tipFor, type Tip, type TipKind } from "../model/tooltip";
import { Tooltip, type TipAnchor } from "./Tooltip";

const TIP_DELAY_MS = 350;
const FINAL_LABEL_GAP = 12;
const FINAL_LABEL_CH = 14; // one character of a final state's name at the largest label scale

export interface ChartProps {
  machine: string;
  graph: Graph;
  activePath: string;
  colorMode: "light" | "dark";
}
type Props = ChartProps;

// Saved drag positions only fit the layout they were dragged in: node heights
// differ between overview and detail, and v2 marks the layered layout.
const posKey = (m: string, compact: boolean) => `fate-pos-v2-${m}-${compact ? "overview" : "detail"}`;

function loadOverrides(machine: string, compact: boolean): Record<string, { x: number; y: number }> {
  try {
    return JSON.parse(localStorage.getItem(posKey(machine, compact)) || "{}");
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

/** The state a fresh actor starts in: the initial chain followed down to a leaf. */
function initialLeaf(ns: FNode[]): FNode | undefined {
  let at = ns.find((n) => n.data.vm.node.initial && !n.parentId);
  for (;;) {
    const children = ns.filter((n) => n.parentId === at?.id);
    const next = children.find((n) => n.data.vm.node.initial) ?? (at?.type === "parallel" ? children[0] : undefined);
    if (!next) return at;
    at = next;
  }
}

function ChartInner({ machine, graph, activePath, colorMode }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FNode>([]);
  const [edges, setEdges] = useEdgesState<FEdge>([]);
  const [version, setVersion] = useState(0);
  const [globals, setGlobals] = useState<string[]>([]);
  const [showGlobals, setShowGlobals] = useState(false);
  const [compact, setCompact] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [laidOut, setLaidOut] = useState(0);
  const [tip, setTip] = useState<{ tip: Tip; anchor: TipAnchor } | null>(null);
  const rf = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipKey = useRef("");
  const tipTimer = useRef<number | undefined>(undefined);

  const vm = useMemo(() => buildViewModel(graph), [graph]);
  const active = useMemo(() => activeFromPath(activePath), [activePath]);
  // Layout is async; it reads the active set at the end, not when it started.
  const activeRef = useRef(active);
  activeRef.current = active;

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

      const overrides = loadOverrides(machine, compact);
      for (const [id, o] of Object.entries(overrides)) {
        const p = layout.rel.get(id);
        if (p) layout.rel.set(id, { ...p, x: o.x, y: o.y });
      }

      const ns = buildNodes(vm, layout.rel, activeRef.current, compact);
      const es = buildEdges(vm, activeRef.current, compact);
      const abs = absOf(ns);

      routerRef.current?.destroy();
      const router = new AvoidRouter();
      routerRef.current = router;
      router.setScene(buildObstacles(vm, abs), abs, buildRouterEdges(vm, abs, compact));
      const routes = router.route();

      const routed = es.map((e) =>
        routes.has(e.id) ? ({ ...e, data: { ...e.data!, points: routes.get(e.id) } } as FEdge) : e,
      );
      if (cancelled) return;
      setNodes(ns);
      setEdges(routed.map((e) => (e.data?.global ? { ...e, hidden: !showGlobals } : e)));
      setGlobals(vm.globals);
      setLaidOut((n) => n + 1);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm, machine, version, compact]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(tipTimer.current);
      routerRef.current?.destroy();
      routerRef.current = null;
    },
    [],
  );

  // Fit after every layout. The rects come from the layout itself, so this
  // does not wait for React Flow to measure the nodes.
  useEffect(() => {
    if (!laidOut) return;
    let raf = 0;
    let tries = 0;
    const fit = () => {
      const el = wrapRef.current;
      const ns = nodesRef.current;
      if (!el || !ns.length || !rf.viewportInitialized) {
        if (tries++ < 60) raf = requestAnimationFrame(fit);
        return;
      }
      const abs = absOf(ns);
      // A final state's name is drawn to the right of its ring, outside its rect.
      for (const n of ns) {
        const r = abs.get(n.id);
        if (r && n.type === "final") abs.set(n.id, { ...r, w: r.w + FINAL_LABEL_GAP + n.data.vm.node.label.length * FINAL_LABEL_CH });
      }
      const bounds = boundsOf(abs.values());
      if (!bounds) return;
      const act = activeRef.current;
      const anchorNode = ns.find((n) => act.leaves.has(n.data.vm.node.path)) ?? initialLeaf(ns) ?? ns[0];
      const view = fitViewport(bounds, abs.get(anchorNode.id) ?? bounds, el.clientWidth, el.clientHeight);
      el.style.setProperty("--label-scale", String(labelScale(view.zoom)));
      void rf.setViewport(view);
    };
    raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidOut]);

  // Re-route on drag — rAF-coalesced so libavoid runs at most once per frame.
  useEffect(() => {
    if (!isDraggingRef.current || !routerRef.current) return;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const r = routerRef.current;
      if (!r) return;
      const abs = absOf(nodesRef.current);
      r.sync(buildObstacles(vm, abs), abs);
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
        // Transitions declared on a compound parent fire while a descendant is active.
        const on = active.paths.has(pathById.get(e.source) ?? "");
        const focusCls = focusEdges ? (focusEdges.has(e.id) ? "hl" : "dim") : "";
        const className = [on ? "edge-active" : "", focusCls].filter(Boolean).join(" ") || undefined;
        return { ...e, data: { ...e.data!, active: on }, animated: on, className };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hover]);

  // Written straight to the wrapper: a zoom gesture must not re-render the chart.
  useOnViewportChange({
    onChange: (v) => wrapRef.current?.style.setProperty("--label-scale", String(labelScale(v.zoom))),
  });

  const onNodeMouseEnter = useCallback((_e: unknown, node: Node) => setHover(node.id), []);
  const onNodeMouseLeave = useCallback(() => setHover(null), []);

  const hideTip = useCallback(() => {
    window.clearTimeout(tipTimer.current);
    tipKey.current = "";
    setTip(null);
  }, []);

  // One delegated handler covers nodes, transition rows and edges: a row is the
  // edge it draws, so it gets the edge's tooltip.
  const onTipOver = (ev: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap || ev.buttons) return hideTip();
    const target = ev.target as Element;
    const row = target.closest<HTMLElement>("[data-tip-edge]");
    const edgeEl = row ? null : target.closest<SVGGElement>(".react-flow__edge");
    const nodeEl = row || edgeEl ? null : target.closest<HTMLElement>(".react-flow__node");
    const kind: TipKind = nodeEl ? "node" : "edge";
    const id = row?.dataset.tipEdge ?? edgeEl?.getAttribute("data-id") ?? nodeEl?.getAttribute("data-id");
    if (!id) return hideTip();
    const key = `${kind}:${id}`;
    if (key === tipKey.current) return;
    hideTip();
    const found = tipFor(vm, kind, id);
    if (!found) return;
    tipKey.current = key;

    const box = wrap.getBoundingClientRect();
    // A row's tooltip hangs off its node, so it does not cover the rows below.
    const el = row?.closest<HTMLElement>(".react-flow__node") ?? nodeEl;
    const r = el?.getBoundingClientRect();
    const anchor: TipAnchor = r
      ? { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }
      : { x: ev.clientX - box.left, y: ev.clientY - box.top, w: 0, h: 0 };
    tipTimer.current = window.setTimeout(() => setTip({ tip: found, anchor }), TIP_DELAY_MS);
  };

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
            localStorage.setItem(posKey(machine, compact), JSON.stringify(ov));
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
      localStorage.removeItem(posKey(machine, compact));
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
    <div
      className="chart-wrap"
      ref={wrapRef}
      onMouseOver={onTipOver}
      onMouseLeave={hideTip}
      onMouseDown={hideTip}
      onWheel={hideTip}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleChanges}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        colorMode={colorMode}
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
              <button className={`seg-btn${compact ? " on" : ""}`} onClick={() => setCompact(true)} title="State names only">
                Overview
              </button>
              <button className={`seg-btn${compact ? "" : " on"}`} onClick={() => setCompact(false)} title="Transition rows and actions">
                Detail
              </button>
            </div>
            <button className="retidy-btn" onClick={retidy} title="Run the automatic layout again">
              <Icon name="layout" />Re-tidy
            </button>
          </div>
        </Panel>
        {globals.length > 0 && (
          <Panel position="top-right">
            <div className="globals-legend">
              <div className="gl-title">
                Shared events <span className="gl-count">{globals.length}</span>
              </div>
              <p className="gl-hint">Accepted by many states. Each state shows them as a chip, so their lines do not cover the chart.</p>
              <div className="gl-chips">
                {globals.map((ev) => (
                  <span key={ev} className="badge-ev">
                    <Icon name="global" size={11} /> {ev}
                  </span>
                ))}
              </div>
              <Checkbox className="gl-toggle" label="Draw their lines" checked={showGlobals} onChange={toggleGlobals} />
            </div>
          </Panel>
        )}
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} className="mesh-bg" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n: Node) => {
            if (n.type === "parallel") return "color-mix(in srgb, var(--accent) 30%, transparent)";
            return "color-mix(in srgb, var(--edge) 45%, transparent)";
          }}
          maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
        />
      </ReactFlow>
      {tip && <Tooltip tip={tip.tip} anchor={tip.anchor} />}
    </div>
  );
}

export function Chart(props: Props) {
  return (
    <ReactFlowProvider>
      <ChartInner {...props} />
    </ReactFlowProvider>
  );
}
