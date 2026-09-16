import { describe, it, expect } from "vitest";
import { buildViewModel, edgeLabel } from "./viewModel";
import type { Graph, GraphEdge } from "../../types";
import order from "../__fixtures__/order.graph.json";
import ticket from "../__fixtures__/ticket.graph.json";

describe("edgeLabel", () => {
  it("drops empty action placeholders and marks internal", () => {
    const e: GraphEdge = {
      id: "x",
      source: "a",
      target: "a",
      event: "STATUS_UPDATE",
      actions: [""],
      internal: true,
    };
    expect(edgeLabel(e)).toBe("STATUS_UPDATE ⟳");
  });
  it("renders guard and real actions", () => {
    const e: GraphEdge = { id: "x", source: "a", target: "b", event: "GO", guard: "ok", actions: ["log"] };
    expect(edgeLabel(e)).toBe("GO [ok] /log");
  });
});

describe("buildViewModel (order)", () => {
  const vm = buildViewModel(order as Graph);

  it("keeps all nodes and edges", () => {
    expect(vm.nodes).toHaveLength((order as Graph).nodes.length);
    expect(vm.edges).toHaveLength((order as Graph).edges.length);
  });

  it("orders parents before children", () => {
    const pos = new Map(vm.nodes.map((n, i) => [n.node.id, i]));
    for (const n of vm.nodes) {
      if (n.node.parent) expect(pos.get(n.node.parent)!).toBeLessThan(pos.get(n.node.id)!);
    }
  });

  it("flags self-loops by source===target", () => {
    const sl = vm.edges.find((e) => e.edge.event === "STATUS_UPDATE")!;
    expect(sl.selfLoop).toBe(true);
    const norm = vm.edges.find((e) => e.edge.event === "CANCEL")!;
    expect(norm.selfLoop).toBe(false);
  });

  it("gives each row a distinct, sequential index per node", () => {
    const ret = vm.nodes.find((n) => n.node.id === "s_order_payment_pending")!;
    expect(ret.rows.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(ret.rows.map((r) => r.edge.event)).toEqual(["AUTHORIZE", "CANCEL", "DECLINE"]);
  });

  it("source row index round-trips to the edge", () => {
    const e = vm.edges.find((x) => x.edge.event === "DECLINE" && x.edge.source === "s_order_payment_pending")!;
    expect(e.sourceRowIndex).toBe(2);
  });

  it("order has no global badges", () => {
    expect(vm.globals).toEqual([]);
    expect(vm.nodes.every((n) => n.badges.length === 0)).toBe(true);
  });
});

describe("buildViewModel (ticket): globals are badged, not rowed", () => {
  const vm = buildViewModel(ticket as Graph);

  it("global events appear as node badges and are marked global on edges", () => {
    expect(vm.globals).toContain("CANCEL");
    const anyBadge = vm.nodes.some((n) => n.badges.includes("CANCEL"));
    expect(anyBadge).toBe(true);
    // No row should carry a global event.
    const rowEvents = new Set(vm.nodes.flatMap((n) => n.rows.map((r) => r.edge.event)));
    expect(rowEvents.has("CANCEL")).toBe(false);
    // The corresponding edges are flagged global.
    expect(vm.edges.some((e) => e.edge.event === "CANCEL" && e.global)).toBe(true);
  });
});
