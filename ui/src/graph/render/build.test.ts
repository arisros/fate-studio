import { describe, it, expect } from "vitest";
import { buildNodes, buildEdges, buildRouterEdges } from "./build";
import { buildViewModel } from "../model/viewModel";
import { runLayout } from "../layout/elkEngine";
import { activeFromPath } from "../active";
import { rowHandleId, COMPACT_SOURCE_ID, rowCenterY } from "../model/handles";
import type { Graph } from "../../types";
import esign from "../__fixtures__/esign.graph.json";

const g = esign as Graph;
const vm = buildViewModel(g);
const noActive = activeFromPath("");

describe("buildEdges (esign)", () => {
  it("keeps every edge and marks self-loops", () => {
    const es = buildEdges(vm, noActive, false);
    expect(es).toHaveLength(g.edges.length);
    const sl = es.find((e) => e.data!.event === "STATUS_CALLBACK")!;
    expect(sl.data!.selfLoop).toBe(true);
  });

  it("uses per-row source handles in fields mode, single handle compact", () => {
    const eid = "s_active_return_form_bpkb_return__RETURN_BPKB__2";
    expect(buildEdges(vm, noActive, false).find((e) => e.id === eid)!.sourceHandle).toBe(rowHandleId(eid));
    expect(buildEdges(vm, noActive, true).find((e) => e.id === eid)!.sourceHandle).toBe(COMPACT_SOURCE_ID);
  });
});

describe("buildRouterEdges (esign)", () => {
  it("excludes self-loops and globals, sets row-center srcDy in fields mode", async () => {
    const layout = await runLayout(vm, false);
    const re = buildRouterEdges(vm, layout.abs, false);
    // self-loops dropped
    expect(re.some((e) => e.id.includes("STATUS_CALLBACK"))).toBe(false);
    // RETURN_BPKB is row index 1 on its source node
    const rb = re.find((e) => e.id.includes("RETURN_BPKB"))!;
    expect(rb.srcDy).toBe(rowCenterY(1));
  }, 20000);
});

describe("buildNodes (esign)", () => {
  it("maps node types and positions from the layout", async () => {
    const layout = await runLayout(vm, false);
    const ns = buildNodes(vm, layout.rel, noActive, false);
    const par = ns.find((n) => n.id === "s_active")!;
    expect(par.type).toBe("parallel");
    const leaf = ns.find((n) => n.id === "s_active_return_form_bpkb_return")!;
    expect(leaf.type).toBe("state");
    expect(leaf.parentId).toBe("s_active_return");
    expect(leaf.extent).toBe("parent");
    expect((leaf.style!.width as number)).toBeGreaterThan(0);
  }, 20000);
});
