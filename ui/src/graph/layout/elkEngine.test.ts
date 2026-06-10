import { describe, it, expect } from "vitest";
import { runLayout, flatten, absFromRel } from "./elkEngine";
import { buildViewModel } from "../model/viewModel";
import type { Graph } from "../../types";
import esign from "../__fixtures__/esign.graph.json";

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

describe("runLayout (real ELK, esign smoke)", () => {
  it("places every node with a positive-size absolute rect", async () => {
    const vm = buildViewModel(esign as Graph);
    const out = await runLayout(vm);
    for (const n of vm.nodes) {
      const r = out.abs.get(n.node.id);
      expect(r, n.node.id).toBeDefined();
      expect(r!.w).toBeGreaterThan(0);
      expect(r!.h).toBeGreaterThan(0);
    }
    // Children sit inside their parent's absolute box.
    const par = out.abs.get("s_active")!;
    const lane = out.abs.get("s_active_followup")!;
    expect(lane.x).toBeGreaterThanOrEqual(par.x);
    expect(lane.y).toBeGreaterThanOrEqual(par.y);
  }, 20000);
});
