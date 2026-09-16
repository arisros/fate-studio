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
  it("ticket badges the convergent CANCEL and the divergent ROUTE, not the NEXT backbone", () => {
    expect(detectGlobalEvents(ticket as Graph)).toEqual(["CANCEL", "ROUTE"]);
  });
  it("a single event cycling through every state is a backbone", () => {
    expect(detectGlobalEvents(trafficLight as Graph)).toEqual([]);
    expect(detectGlobalEvents(pipeline as Graph)).toEqual([]);
  });
});
