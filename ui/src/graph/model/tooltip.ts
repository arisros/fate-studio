import type { ViewModel } from "./viewModel";

// What the chart tooltip says about a node or an edge. Pure — no React, no DOM.

export interface TipRow {
  label: "type" | "actions" | "guard" | "target" | "warning";
  value: string;
}

export interface Tip {
  name: string;
  rows: TipRow[];
}

export type TipKind = "node" | "edge";

const named = (xs: string[] | undefined) => (xs ?? []).filter((x) => x.trim() !== "");

export function tipFor(vm: ViewModel, kind: TipKind, id: string): Tip | null {
  return kind === "node" ? nodeTip(vm, id) : edgeTip(vm, id);
}

function nodeTip(vm: ViewModel, id: string): Tip | null {
  const n = vm.nodes.find((x) => x.node.id === id)?.node;
  if (!n) return null;
  let type: string = n.type;
  if (n.type === "history") type = `${n.history ?? "shallow"} history`;
  if (n.initial) type += ", initial";

  const rows: TipRow[] = [{ label: "type", value: type }];
  const actions = [
    ...named(n.entry).map((a) => `entry ${a}`),
    ...named(n.exit).map((a) => `exit ${a}`),
  ];
  if (actions.length) rows.push({ label: "actions", value: actions.join(", ") });
  return { name: n.path, rows };
}

function edgeTip(vm: ViewModel, id: string): Tip | null {
  const e = vm.edges.find((x) => x.edge.id === id);
  if (!e) return null;
  const type = e.edge.internal ? "internal" : e.selfLoop ? "self" : e.global ? "global" : "transition";

  const rows: TipRow[] = [{ label: "type", value: type }];
  const actions = named(e.edge.actions);
  if (actions.length) rows.push({ label: "actions", value: actions.join(", ") });
  if (e.edge.guard) rows.push({ label: "guard", value: e.edge.guard });
  if (e.edge.fallback) rows.push({ label: "guard", value: "otherwise: taken when the guards before it refuse" });
  if (e.edge.shadowed) {
    rows.push({ label: "warning", value: `never fires: an earlier ${e.edge.event} transition has no guard` });
  }
  const target = vm.graph.nodes.find((n) => n.id === e.edge.target);
  if (target) rows.push({ label: "target", value: target.path });
  return { name: e.edge.event, rows };
}
