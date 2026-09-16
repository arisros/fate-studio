import { describe, it, expect, beforeEach } from "vitest";
import { VirtualSimulator } from "./virtualSim";
import { evaluateGates } from "./gateEval";
import order from "../__fixtures__/order.graph.json";
import mediaPlayer from "../__fixtures__/media-player.graph.json";
import ticket from "../__fixtures__/ticket.graph.json";
import type { Graph } from "../../types";

const ORDER_INITIAL = "order.fulfillment.picking | order.payment.pending | order.support.idle";

describe("VirtualSimulator: parallel regions (order)", () => {
  let sim: VirtualSimulator;

  beforeEach(() => {
    sim = new VirtualSimulator(order as Graph);
  });

  it("enters every region on construction", () => {
    expect(sim.path).toBe(ORDER_INITIAL);
  });

  it("offers the events of every active region, sorted", () => {
    expect(sim.availableEvents()).toEqual(["AUTHORIZE", "CANCEL", "DECLINE", "OPEN_TICKET", "PICKED"]);
  });

  it("send() with an unknown event returns false and keeps the path", () => {
    expect(sim.send("NO_SUCH_EVENT")).toBe(false);
    expect(sim.path).toBe(ORDER_INITIAL);
  });

  it("an event one region handles advances only that region", () => {
    expect(sim.send("PICKED")).toBe(true);
    expect(sim.path).toBe("order.fulfillment.packing | order.payment.pending | order.support.idle");
  });

  it("a self-loop keeps the path but is recorded in history", () => {
    sim.send("AUTHORIZE");
    const authorized = sim.path;
    sim.send("STATUS_UPDATE");
    sim.send("STATUS_UPDATE");
    expect(sim.path).toBe(authorized);
    sim.undo();
    sim.undo();
    expect(sim.path).toBe(authorized);
    expect(sim.undo()).toBe(true);
    expect(sim.path).toBe(ORDER_INITIAL);
    expect(sim.undo()).toBe(false);
  });

  it("reset() restores the initial path and clears history", () => {
    sim.send("PICKED");
    sim.reset();
    expect(sim.path).toBe(ORDER_INITIAL);
    expect(sim.undo()).toBe(false);
  });
});

describe("VirtualSimulator: one event in every region (media-player)", () => {
  let sim: VirtualSimulator;
  const INITIAL =
    "playing.audio.decoding_audio | playing.captions.rendering_captions | playing.video.decoding_video";

  beforeEach(() => {
    sim = new VirtualSimulator(mediaPlayer as Graph);
  });

  it("NEXT advances all regions at once", () => {
    expect(sim.path).toBe(INITIAL);
    expect(sim.send("NEXT")).toBe(true);
    expect(sim.path).toBe("playing.audio.done | playing.captions.done | playing.video.done");
    expect(sim.availableEvents()).toEqual([]);
  });

  it("undo after NEXT returns every region", () => {
    sim.send("NEXT");
    expect(sim.undo()).toBe(true);
    expect(sim.path).toBe(INITIAL);
  });
});

describe("VirtualSimulator: guarded branches (ticket)", () => {
  let sim: VirtualSimulator;

  beforeEach(() => {
    sim = new VirtualSimulator(ticket as Graph);
  });

  const choose = (path: string) =>
    sim.decide(sim.pendingDecision!.choices.find((c) => c.targetPath === path)!.targetId);

  const toReview = () => {
    sim.send("NEXT");
    sim.send("ROUTE");
    choose("general");
    sim.send("NEXT");
    sim.send("NEXT");
    expect(sim.path).toBe("review");
  };

  it("starts at the initial leaf with its events", () => {
    expect(sim.path).toBe("new");
    expect(sim.availableEvents()).toEqual(["CANCEL", "MARK_BILLING", "MARK_TECHNICAL", "NEXT"]);
  });

  it("a single target advances without a decision", () => {
    expect(sim.send("CANCEL")).toBe(true);
    expect(sim.pendingDecision).toBeNull();
    expect(sim.path).toBe("cancelled");
  });

  it("several targets raise a decision instead of advancing", () => {
    sim.send("NEXT");
    expect(sim.send("ROUTE")).toBe(true);
    expect(sim.path).toBe("triaged");
    const d = sim.pendingDecision!;
    expect(d.event).toBe("ROUTE");
    expect(d.choices.map((c) => c.targetPath).sort()).toEqual(["billing", "general", "technical"]);
    expect(d.choices.some((c) => c.isSelfLoop)).toBe(false);
  });

  it("carries each branch's gate so the panel can check it", () => {
    sim.send("NEXT");
    sim.send("ROUTE");
    const byPath = new Map(sim.pendingDecision!.choices.map((c) => [c.targetPath, c.condMeta]));
    expect(byPath.get("billing")).toEqual({
      fields: [{ path: "$.category", op: "eq", value: "billing" }],
      sample: { category: "billing" },
    });
    expect(byPath.get("general")).toBeUndefined();
    const evals = evaluateGates(byPath.get("technical")!, { category: "technical" });
    expect(evals.map((e) => e.status)).toEqual(["open"]);
  });

  it("decide() commits the chosen branch", () => {
    sim.send("NEXT");
    sim.send("ROUTE");
    expect(choose("technical")).toBe(true);
    expect(sim.path).toBe("technical");
    expect(sim.pendingDecision).toBeNull();
  });

  it("offers a self-loop alongside the forward branch", () => {
    toReview();
    sim.send("NEXT");
    const choices = sim.pendingDecision!.choices;
    expect(choices.map((c) => [c.targetPath, c.isSelfLoop]).sort()).toEqual([
      ["closed", false],
      ["review", true],
    ]);
    choose("review");
    expect(sim.path).toBe("review");
    sim.send("NEXT");
    choose("closed");
    expect(sim.path).toBe("closed");
  });

  it("undo() with a pending decision cancels it without touching history", () => {
    sim.send("NEXT");
    sim.send("ROUTE");
    expect(sim.undo()).toBe(true);
    expect(sim.pendingDecision).toBeNull();
    expect(sim.path).toBe("triaged");
    expect(sim.undo()).toBe(true);
    expect(sim.path).toBe("new");
  });

  it("undo() after decide() reverts the committed branch", () => {
    sim.send("NEXT");
    sim.send("ROUTE");
    choose("billing");
    sim.undo();
    expect(sim.path).toBe("triaged");
  });

  it("cancelDecision() and reset() clear a pending decision", () => {
    sim.send("NEXT");
    sim.send("ROUTE");
    sim.cancelDecision();
    expect(sim.pendingDecision).toBeNull();
    expect(sim.path).toBe("triaged");
    sim.send("ROUTE");
    sim.reset();
    expect(sim.pendingDecision).toBeNull();
    expect(sim.path).toBe("new");
  });

  it("send() is refused while a decision is pending", () => {
    sim.send("NEXT");
    sim.send("ROUTE");
    expect(sim.send("CANCEL")).toBe(false);
    expect(sim.path).toBe("triaged");
  });
});
