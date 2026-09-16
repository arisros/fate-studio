import { describe, it, expect } from "vitest";
import { classifyCtx, classifyNode } from "./classify";
import { detectGlobalEvents } from "./globals";
import type { Graph, GraphNode } from "../../types";
import order from "../__fixtures__/order.graph.json";

const g = order as Graph;
const ctx = classifyCtx(g, new Set(detectGlobalEvents(g)));
const byId = new Map(g.nodes.map((n) => [n.id, n as GraphNode]));
const cls = (id: string) => classifyNode(byId.get(id)!, ctx);

describe("classifyNode (order)", () => {
  it("the parallel root is rfType=parallel and a container", () => {
    const c = cls("s_order");
    expect(c.rfType).toBe("parallel");
    expect(c.isContainer).toBe(true);
  });

  it("direct children of the parallel are lanes (compound containers)", () => {
    const c = cls("s_order_fulfillment");
    expect(c.rfType).toBe("compound");
    expect(c.isLane).toBe(true);
    expect(c.isContainer).toBe(true);
  });

  it("atomic form states are leaf 'state' nodes with own transitions", () => {
    const c = cls("s_order_payment_pending");
    expect(c.rfType).toBe("state");
    expect(c.isContainer).toBe(false);
    expect(c.hasOwnTransitions).toBe(true);
  });

  it("final states are rfType=final with no transitions", () => {
    const c = cls("s_order_payment_captured");
    expect(c.rfType).toBe("final");
    expect(c.hasOwnTransitions).toBe(false);
  });
});
