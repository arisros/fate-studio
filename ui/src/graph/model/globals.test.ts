import { describe, it, expect } from "vitest";
import { detectGlobalEvents } from "./globals";
import type { Graph } from "../../types";
import order from "../__fixtures__/order.graph.json";
import ticket from "../__fixtures__/ticket.graph.json";
import trafficLight from "../__fixtures__/traffic-light.graph.json";
import pipeline from "../__fixtures__/pipeline.graph.json";

describe("detectGlobalEvents (demo machines)", () => {
  it("order has no global events", () => {
    expect(detectGlobalEvents(order as Graph)).toEqual([]);
  });
  it("ticket badges the convergent CANCEL, not the NEXT backbone or the small ROUTE fan-out", () => {
    expect(detectGlobalEvents(ticket as Graph)).toEqual(["CANCEL"]);
  });
  it("badges a hub that fans out to five or more targets", () => {
    const targets = ["a", "b", "c", "d", "e"];
    const hub: Graph = {
      id: "hub",
      initial: "start",
      nodes: ["start", ...targets].map((id) => ({ id, label: id, path: id, type: "atomic", parent: "", initial: id === "start" })),
      edges: targets.map((t, i) => ({ id: `e${i}`, source: "start", event: "DETOUR", target: t })),
    };
    expect(detectGlobalEvents(hub)).toEqual(["DETOUR"]);
  });
  it("a single event cycling through every state is a backbone", () => {
    expect(detectGlobalEvents(trafficLight as Graph)).toEqual([]);
    expect(detectGlobalEvents(pipeline as Graph)).toEqual([]);
  });
});
