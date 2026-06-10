import { describe, it, expect } from "vitest";
import { classifyCtx, classifyNode } from "./classify";
import { detectGlobalEvents } from "./globals";
import type { Graph, GraphNode } from "../../types";
import esign from "../__fixtures__/esign.graph.json";

const g = esign as Graph;
const ctx = classifyCtx(g, new Set(detectGlobalEvents(g)));
const byId = new Map(g.nodes.map((n) => [n.id, n as GraphNode]));
const cls = (id: string) => classifyNode(byId.get(id)!, ctx);

describe("classifyNode (esign)", () => {
  it("the parallel root is rfType=parallel and a container", () => {
    const c = cls("s_active");
    expect(c.rfType).toBe("parallel");
    expect(c.isContainer).toBe(true);
  });

  it("direct children of the parallel are lanes (compound containers)", () => {
    const c = cls("s_active_followup");
    expect(c.rfType).toBe("compound");
    expect(c.isLane).toBe(true);
    expect(c.isContainer).toBe(true);
  });

  it("atomic form states are leaf 'state' nodes with own transitions", () => {
    const c = cls("s_active_return_form_bpkb_return");
    expect(c.rfType).toBe("state");
    expect(c.isContainer).toBe(false);
    expect(c.hasOwnTransitions).toBe(true);
  });

  it("final states are rfType=final with no transitions", () => {
    const c = cls("s_active_main_done");
    expect(c.rfType).toBe("final");
    expect(c.hasOwnTransitions).toBe(false);
  });
});
