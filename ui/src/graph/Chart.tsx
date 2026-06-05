import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "../types";
import { layoutGraph, toFlow, type EdgeData, type Positioned, type StateNodeData } from "./flow";
import { activeFromPath } from "./active";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";

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

function ChartInner({ machine, graph, activePath, colorMode }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StateNodeData>>([]);
  const [edges, setEdges] = useEdgesState<Edge<EdgeData>>([]);
  const layoutRef = useRef<Map<string, Positioned>>(new Map());
  const active = useMemo(() => activeFromPath(activePath), [activePath]);

  // Layout once per graph (ELK is async). Apply persisted drag overrides.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pos = await layoutGraph(graph);
      const overrides = loadOverrides(machine);
      for (const [id, o] of Object.entries(overrides)) {
        const p = pos.get(id);
        if (p) pos.set(id, { ...p, x: o.x, y: o.y });
      }
      if (cancelled) return;
      layoutRef.current = pos;
      const { nodes: ns, edges: es } = toFlow(graph, pos, activeFromPath(activePath));
      setNodes(ns);
      setEdges(es);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, machine]);

  // Re-highlight on active change — no relayout, just toggle flags.
  useEffect(() => {
    setNodes((ns: Node<StateNodeData>[]) =>
      ns.map((n: Node<StateNodeData>) => {
        const path = n.data.node.path;
        return {
          ...n,
          data: { ...n.data, active: active.paths.has(path), activeLeaf: active.leaves.has(path) },
        };
      }),
    );
    setEdges((es: Edge<EdgeData>[]) =>
      es.map((e: Edge<EdgeData>) => {
        const srcPath = graph.nodes.find((g) => g.id === e.source)?.path ?? "";
        const on = active.leaves.has(srcPath);
        return { ...e, data: { active: on }, className: on ? "edge-active" : undefined };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Persist positions after a drag.
  const handleChanges = (changes: NodeChange<Node<StateNodeData>>[]) => {
    onNodesChange(changes);
    const dragEnd = changes.some((c) => c.type === "position" && c.dragging === false);
    if (dragEnd) {
      // Read back current positions on next tick.
      requestAnimationFrame(() => {
        setNodes((ns: Node<StateNodeData>[]) => {
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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleChanges}
      colorMode={colorMode}
      fitView
      minZoom={0.2}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
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
