import { describe, it, expect } from "vitest";
import { buildElkSpec, containerLayout } from "./elkSpec";
import { buildViewModel } from "../model/viewModel";
import { NODE_W, leafHeight } from "../model/sizing";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Graph } from "../../types";
import order from "../__fixtures__/order.graph.json";

const vm = buildViewModel(order as Graph);
const spec = buildElkSpec(vm);

function find(root: ElkNode, id: string): ElkNode | undefined {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return undefined;
}

describe("buildElkSpec (order)", () => {
  it("nests the parallel root under the spec root", () => {
    expect(spec.children?.map((c) => c.id)).toContain("s_order");
    const par = find(spec, "s_order")!;
    expect(par.children?.map((c) => c.id).sort()).toEqual([
      "s_order_fulfillment",
      "s_order_payment",
      "s_order_support",
    ]);
  });

  it("sizes leaves by their row count", () => {
    const leaf = find(spec, "s_order_payment_pending")!;
    expect(leaf.width).toBe(NODE_W);
    expect(leaf.height).toBe(leafHeight(3)); // AUTHORIZE, CANCEL, DECLINE
  });

  it("excludes self-loops and globals from ELK edges", () => {
    const ids = new Set((spec.edges ?? []).map((e) => e.id));
    // STATUS_UPDATE is a self-loop → not an ELK edge.
    expect([...ids].some((id) => id.includes("STATUS_UPDATE"))).toBe(false);
    // CANCEL is a real cross-node edge → present.
    expect([...ids].some((id) => id.includes("CANCEL"))).toBe(true);
  });

  it("parallel containers omit the header inset", () => {
    const par = vm.nodes.find((n) => n.node.id === "s_order")!;
    expect(containerLayout(par)["elk.padding"]).toContain("top=60");
  });
});
