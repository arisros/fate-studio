import { describe, it, expect } from "vitest";
import { runLayout, flatten, absFromRel } from "./elkEngine";
import { buildViewModel } from "../model/viewModel";
import type { Graph } from "../../types";
import order from "../__fixtures__/order.graph.json";
import editor from "../__fixtures__/editor.graph.json";
import mediaPlayer from "../__fixtures__/media-player.graph.json";
import ticket from "../__fixtures__/ticket.graph.json";
import { ROUTER_PAD } from "../routing/libavoidConfig";

describe("absFromRel", () => {
  it("accumulates parent origins into absolute rects", () => {
    const abs = absFromRel([
      { id: "p", position: { x: 10, y: 20 }, width: 100, height: 100 },
      { id: "c", parentId: "p", position: { x: 5, y: 5 }, width: 30, height: 30 },
    ]);
    expect(abs.get("p")).toEqual({ x: 10, y: 20, w: 100, h: 100 });
    expect(abs.get("c")).toEqual({ x: 15, y: 25, w: 30, h: 30 });
  });
});

describe("flatten", () => {
  it("produces relative + absolute for a 2-level tree", () => {
    const r = flatten({
      id: "root",
      children: [
        {
          id: "p",
          x: 10,
          y: 10,
          width: 200,
          height: 200,
          children: [{ id: "c", x: 5, y: 8, width: 40, height: 40 }],
        },
      ],
    });
    expect(r.rel.get("c")).toMatchObject({ x: 5, y: 8, parentId: "p" });
    expect(r.abs.get("c")).toEqual({ x: 15, y: 18, w: 40, h: 40 });
  });
});

describe("runLayout (real ELK, order smoke)", () => {
  it("places every node with a positive-size absolute rect", async () => {
    const vm = buildViewModel(order as Graph);
    const out = await runLayout(vm);
    for (const n of vm.nodes) {
      const r = out.abs.get(n.node.id);
      expect(r, n.node.id).toBeDefined();
      expect(r!.w).toBeGreaterThan(0);
      expect(r!.h).toBeGreaterThan(0);
    }
    // Children sit inside their parent's absolute box.
    const par = out.abs.get("s_order")!;
    const lane = out.abs.get("s_order_fulfillment")!;
    expect(lane.x).toBeGreaterThanOrEqual(par.x);
    expect(lane.y).toBeGreaterThanOrEqual(par.y);
  }, 20000);
});

describe("runLayout leaves the router room", () => {
  const cases: [string, unknown][] = [
    ["order", order],
    ["editor", editor],
    ["media-player", mediaPlayer],
    ["ticket", ticket],
  ];
  it.each(cases)("%s: sibling states that share a row are more than two router pads apart", async (_name, g) => {
    const vm = buildViewModel(g as Graph);
    const out = await runLayout(vm);
    const leaves = vm.nodes.filter((n) => !n.cls.isContainer);
    for (const a of leaves) {
      for (const b of leaves) {
        if (a === b || a.node.parent !== b.node.parent) continue;
        const ra = out.abs.get(a.node.id)!;
        const rb = out.abs.get(b.node.id)!;
        const sameRow = ra.y < rb.y + rb.h && rb.y < ra.y + ra.h;
        if (!sameRow || rb.x < ra.x) continue;
        expect(rb.x - (ra.x + ra.w), `${a.node.id} → ${b.node.id}`).toBeGreaterThan(2 * ROUTER_PAD);
      }
    }
  }, 20000);
});
