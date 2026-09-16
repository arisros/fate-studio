import { describe, it, expect } from "vitest";
import { eventsFromGraph } from "./events";
import { activeFromPath } from "../active";
import type { Graph } from "../../types";
import order from "../__fixtures__/order.graph.json";
import editor from "../__fixtures__/editor.graph.json";

describe("eventsFromGraph", () => {
  it("collects the events of every active region", () => {
    const active = activeFromPath("order.fulfillment.picking | order.payment.pending | order.support.idle");
    expect(eventsFromGraph(order as Graph, active.paths)).toEqual([
      "AUTHORIZE",
      "CANCEL",
      "DECLINE",
      "OPEN_TICKET",
      "PICKED",
    ]);
  });

  it("includes events declared on an active ancestor", () => {
    const active = activeFromPath("session.editing.draft");
    expect(eventsFromGraph(editor as Graph, active.paths)).toEqual(["NEXT", "SUSPEND"]);
  });

  it("leaves out automatic onDone edges", () => {
    const g: Graph = {
      id: "g",
      initial: "s_a",
      nodes: [{ id: "s_a", label: "a", path: "a", type: "compound", parent: "", initial: true }],
      edges: [{ id: "e", source: "s_a", target: "s_a", event: "onDone" }],
    };
    expect(eventsFromGraph(g, activeFromPath("a").paths)).toEqual([]);
  });
});
