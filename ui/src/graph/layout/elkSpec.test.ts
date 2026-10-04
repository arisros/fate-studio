import { describe, it, expect } from "vitest";
import { buildElkSpec, containerLayout } from "./elkSpec";
import { buildViewModel } from "../model/viewModel";
import { NODE_W, leafHeight } from "../model/sizing";
import type { ElkNode } from "elkjs/lib/elk-api";
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

  it("declares each edge in the container that holds both ends, and skips self-loops", () => {
    const ids = (id: string) => (find(spec, id)!.edges ?? []).map((e) => e.id);
    expect(spec.edges).toEqual([]);
    expect(ids("s_order_payment").some((id) => id.includes("CANCEL"))).toBe(true);
    expect(ids("s_order_payment").some((id) => id.includes("STATUS_UPDATE"))).toBe(false);
    expect(ids("s_order_fulfillment").some((id) => id.includes("PICKED"))).toBe(true);
  });

  it("feeds children in flow order from the initial state, finals last", () => {
    const lane = find(spec, "s_order_payment")!;
    expect(lane.children?.map((c) => c.id)).toEqual([
      "s_order_payment_pending",
      "s_order_payment_authorized",
      "s_order_payment_declined",
      "s_order_payment_voided",
      "s_order_payment_captured",
    ]);
  });

  it("gives a leaf one port per transition row plus one for incoming edges", () => {
    const leaf = find(spec, "s_order_payment_pending")!;
    expect(leaf.ports?.map((p) => p.layoutOptions?.["elk.port.side"])).toEqual(["WEST", "EAST", "EAST", "EAST"]);
  });

  it("parallel containers omit the header inset", () => {
    const par = vm.nodes.find((n) => n.node.id === "s_order")!;
    expect(containerLayout(par)["elk.padding"]).toContain("top=60");
  });
});
