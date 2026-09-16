import { describe, it, expect } from "vitest";
import { buildNodes, buildEdges, buildRouterEdges } from "./build";
import { buildViewModel } from "../model/viewModel";
import { runLayout } from "../layout/elkEngine";
import { activeFromPath } from "../active";
import { rowHandleId, COMPACT_SOURCE_ID, rowCenterY } from "../model/handles";
import type { Graph } from "../../types";
import order from "../__fixtures__/order.graph.json";

const g = order as Graph;
const vm = buildViewModel(g);
const noActive = activeFromPath("");

describe("buildEdges (order)", () => {
  it("keeps every edge and marks self-loops", () => {
    const es = buildEdges(vm, noActive, false);
    expect(es).toHaveLength(g.edges.length);
    const sl = es.find((e) => e.data!.event === "STATUS_UPDATE")!;
    expect(sl.data!.selfLoop).toBe(true);
  });

  it("uses per-row source handles in fields mode, single handle compact", () => {
    const eid = "s_order_payment_pending__CANCEL__2";
    expect(buildEdges(vm, noActive, false).find((e) => e.id === eid)!.sourceHandle).toBe(rowHandleId(eid));
    expect(buildEdges(vm, noActive, true).find((e) => e.id === eid)!.sourceHandle).toBe(COMPACT_SOURCE_ID);
  });
});

describe("buildRouterEdges (order)", () => {
  it("excludes self-loops and globals, sets row-center srcDy in fields mode", async () => {
    const layout = await runLayout(vm, false);
    const re = buildRouterEdges(vm, layout.abs, false);
    // self-loops dropped
    expect(re.some((e) => e.id.includes("STATUS_UPDATE"))).toBe(false);
    // CANCEL is row index 1 on its source node
    const rb = re.find((e) => e.id.includes("CANCEL"))!;
    expect(rb.srcDy).toBe(rowCenterY(1));
  }, 20000);
});

describe("buildNodes (order)", () => {
  it("maps node types and positions from the layout", async () => {
    const layout = await runLayout(vm, false);
    const ns = buildNodes(vm, layout.rel, noActive, false);
    const par = ns.find((n) => n.id === "s_order")!;
    expect(par.type).toBe("parallel");
    const leaf = ns.find((n) => n.id === "s_order_payment_pending")!;
    expect(leaf.type).toBe("state");
    expect(leaf.parentId).toBe("s_order_payment");
    expect(leaf.extent).toBe("parent");
    expect((leaf.style!.width as number)).toBeGreaterThan(0);
  }, 20000);
});
