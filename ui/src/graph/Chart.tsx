import { useEffect, useMemo, useState } from "react";
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "../types";
import { layoutGraph, toFlow, type EdgeData, type StateNodeData } from "./flow";
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
  // version bumps force a fresh ELK layout (the "re-tidy" button clears the
  // saved drag positions and re-runs auto-layout).
  const [version, setVersion] = useState(0);
  const active = useMemo(() => activeFromPath(activePath), [activePath]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const layout = await layoutGraph(graph);
      const overrides = loadOverrides(machine);
      for (const [id, o] of Object.entries(overrides)) {
        const p = layout.pos.get(id);
        if (p) layout.pos.set(id, { ...p, x: o.x, y: o.y });
      }
      if (cancelled) return;
      const { nodes: ns, edges: es } = toFlow(graph, layout, activeFromPath(activePath));
      setNodes(ns);
      setEdges(es);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, machine, version]);

  // Re-highlight on active change — no relayout; preserve routed edge points.
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
        return { ...e, data: { ...e.data, active: on }, animated: on, className: on ? "edge-active" : undefined };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const handleChanges = (changes: NodeChange<Node<StateNodeData>>[]) => {
    onNodesChange(changes);
    const dragEnd = changes.some((c) => c.type === "position" && c.dragging === false);
    if (dragEnd) {
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

  const retidy = () => {
    try {
      localStorage.removeItem(posKey(machine));
    } catch {
      /* ignore */
    }
    setVersion((v) => v + 1);
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
      minZoom={0.1}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
    >
      <Panel position="top-left">
        <button className="retidy-btn" onClick={retidy} title="re-run auto-layout">
          ↺ re-tidy
        </button>
      </Panel>
      <Background variant={BackgroundVariant.Cross} gap={26} size={3} className="mesh-bg" />
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
