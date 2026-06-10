import { describe, it, expect, beforeEach } from "vitest";
import { VirtualSimulator } from "./virtualSim";
import esign from "../__fixtures__/esign.graph.json";
import bpkbReview from "../__fixtures__/bpkb-review.graph.json";
import type { Graph } from "../../types";

// Minimal media-player-style graph: parallel root with audio/video regions,
// each having NEXT → done. Mirrors the fate-example MediaPlayer machine.
const mediaPlayerGraph: Graph = {
  id: "media-player",
  initial: "playing",
  nodes: [
    { id: "playing",       label: "playing",       path: "playing",             type: "parallel",  parent: "",        initial: true  },
    { id: "audio",         label: "audio",         path: "playing.audio",       type: "compound",  parent: "playing", initial: false },
    { id: "decoding_audio",label: "decoding_audio",path: "playing.audio.decoding_audio", type: "atomic", parent: "audio", initial: true  },
    { id: "audio_done",    label: "done",          path: "playing.audio.done",  type: "final",     parent: "audio",   initial: false },
    { id: "video",         label: "video",         path: "playing.video",       type: "compound",  parent: "playing", initial: false },
    { id: "decoding_video",label: "decoding_video",path: "playing.video.decoding_video", type: "atomic", parent: "video", initial: true  },
    { id: "video_done",    label: "done",          path: "playing.video.done",  type: "final",     parent: "video",   initial: false },
  ],
  edges: [
    { id: "e1", source: "decoding_audio", target: "audio_done", event: "NEXT" },
    { id: "e2", source: "decoding_video", target: "video_done", event: "NEXT" },
  ],
};

// esign: parallel machine — three concurrent regions
// initial: active (parallel) → enters all three child compounds via their initial children
const ESIGN_INITIAL_PATH =
  "active.followup.form_survey_followup_esign | active.main.form_esign_view_only | active.return.form_bpkb_return";

// bpkb-review: atomic initial leaf
const BPKB_INITIAL_PATH = "form_bpkb_review_assignment";

describe("VirtualSimulator — parallel machine (esign)", () => {
  let sim: VirtualSimulator;

  beforeEach(() => {
    sim = new VirtualSimulator(esign as Graph);
  });

  it("enters all parallel regions on construction", () => {
    expect(sim.path).toBe(ESIGN_INITIAL_PATH);
    expect(sim.path).toContain(" | ");
  });

  it("returns available events from all active regions (sorted)", () => {
    const evts = sim.availableEvents();
    // Each region contributes its own events
    expect(evts).toContain("STATUS_CALLBACK"); // followup region
    expect(evts).toContain("MAIN_FINISHED"); // main region
    expect(evts).toContain("RETURN_BPKB"); // return region
    expect(evts).toContain("TERMINATE"); // all three regions
    expect(evts).toContain("FILL_REJECTION"); // return region
    // Must be sorted
    expect([...evts].sort()).toEqual(evts);
  });

  it("send() with unknown event returns false and does not change path", () => {
    const before = sim.path;
    const result = sim.send("NO_SUCH_EVENT");
    expect(result).toBe(false);
    expect(sim.path).toBe(before);
  });

  it("send() TERMINATE advances ALL parallel regions simultaneously", () => {
    // All three regions have a TERMINATE transition — they all advance at once.
    const result = sim.send("TERMINATE");
    expect(result).toBe(true);
    expect(sim.path).toBe(
      "active.followup.done | active.main.done | active.return.done",
    );
  });

  it("send() STATUS_CALLBACK (only followup region has it) keeps other regions in place", () => {
    const result = sim.send("STATUS_CALLBACK");
    expect(result).toBe(true);
    // followup self-loops; main and return are unchanged → full path is the same as initial
    expect(sim.path).toBe(ESIGN_INITIAL_PATH);
  });

  it("undo() reverts to the path before the last send()", () => {
    sim.send("TERMINATE");
    expect(sim.path).toBe("active.followup.done | active.main.done | active.return.done");
    const reverted = sim.undo();
    expect(reverted).toBe(true);
    expect(sim.path).toBe(ESIGN_INITIAL_PATH);
  });

  it("undo() returns false when history is empty", () => {
    expect(sim.undo()).toBe(false);
  });

  it("reset() restores initial path and clears history", () => {
    sim.send("TERMINATE");
    sim.reset();
    expect(sim.path).toBe(ESIGN_INITIAL_PATH);
    // After reset undo should be a no-op (history cleared)
    expect(sim.undo()).toBe(false);
  });

  it("chains multiple undo() calls back to initial", () => {
    // STATUS_CALLBACK self-loops (path stays the same) but each send() is recorded in history.
    sim.send("STATUS_CALLBACK");
    sim.send("STATUS_CALLBACK");
    sim.undo();
    sim.undo();
    expect(sim.path).toBe(ESIGN_INITIAL_PATH);
    expect(sim.undo()).toBe(false); // history now empty
  });
});

describe("VirtualSimulator — media-player (parallel, two regions)", () => {
  let sim: VirtualSimulator;
  const MEDIA_INITIAL = "playing.audio.decoding_audio | playing.video.decoding_video";

  beforeEach(() => {
    sim = new VirtualSimulator(mediaPlayerGraph);
  });

  it("enters both parallel regions on construction", () => {
    expect(sim.path).toBe(MEDIA_INITIAL);
  });

  it("NEXT advances BOTH regions simultaneously — not just audio", () => {
    const result = sim.send("NEXT");
    expect(result).toBe(true);
    expect(sim.path).toBe("playing.audio.done | playing.video.done");
  });

  it("after NEXT, no more events available (both regions are final)", () => {
    sim.send("NEXT");
    expect(sim.availableEvents()).toEqual([]);
  });

  it("undo after NEXT returns to both-active initial", () => {
    sim.send("NEXT");
    expect(sim.undo()).toBe(true);
    expect(sim.path).toBe(MEDIA_INITIAL);
  });

  it("unknown event returns false and leaves both regions unchanged", () => {
    expect(sim.send("PAUSE")).toBe(false);
    expect(sim.path).toBe(MEDIA_INITIAL);
  });
});

describe("VirtualSimulator — atomic machine (bpkb-review)", () => {
  let sim: VirtualSimulator;

  beforeEach(() => {
    sim = new VirtualSimulator(bpkbReview as Graph);
  });

  it("enters the initial atomic leaf on construction", () => {
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
    expect(sim.path).not.toContain(" | ");
  });

  it("availableEvents() includes events from the initial leaf", () => {
    const evts = sim.availableEvents();
    expect(evts).toContain("SUBMIT");
    expect(evts).toContain("TERMINATE");
    expect([...evts].sort()).toEqual(evts);
  });

  it("send() TERMINATE transitions to the final state", () => {
    const result = sim.send("TERMINATE");
    expect(result).toBe(true);
    expect(sim.path).toBe("done");
  });

  it("send() unknown event returns false and preserves path", () => {
    const before = sim.path;
    expect(sim.send("NOPE")).toBe(false);
    expect(sim.path).toBe(before);
  });

  it("undo() after TERMINATE restores initial path", () => {
    sim.send("TERMINATE");
    expect(sim.undo()).toBe(true);
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
  });

  it("reset() from any state returns to initial path", () => {
    sim.send("TERMINATE");
    sim.reset();
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
  });

  it("undo() returns false on a fresh simulator", () => {
    expect(sim.undo()).toBe(false);
  });

  // SUBMIT has 3 edges from form_bpkb_review_assignment:
  //   2× self-loop, 1× → form_bpkb_review
  // Virtual sim should surface a decision instead of silently self-looping.
  it("send() SUBMIT triggers a pending decision (multiple unique targets)", () => {
    const result = sim.send("SUBMIT");
    expect(result).toBe(true);
    // Path stays until decision is made
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
    expect(sim.pendingDecision).not.toBeNull();
    expect(sim.pendingDecision!.event).toBe("SUBMIT");
    const targets = sim.pendingDecision!.choices.map((c) => c.targetPath);
    // Two unique targets: self-loop and form_bpkb_review
    expect(targets).toContain(BPKB_INITIAL_PATH);
    expect(targets).toContain("form_bpkb_review");
    expect(new Set(targets).size).toBe(2);
  });

  it("decide() advances to the chosen target", () => {
    sim.send("SUBMIT");
    const fwdChoice = sim.pendingDecision!.choices.find((c) => !c.isSelfLoop)!;
    const ok = sim.decide(fwdChoice.targetId);
    expect(ok).toBe(true);
    expect(sim.path).toBe("form_bpkb_review");
    expect(sim.pendingDecision).toBeNull();
  });

  it("decide() self-loop stays on current path", () => {
    sim.send("SUBMIT");
    const selfChoice = sim.pendingDecision!.choices.find((c) => c.isSelfLoop)!;
    sim.decide(selfChoice.targetId);
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
    expect(sim.pendingDecision).toBeNull();
  });

  it("undo() with pending decision cancels it (no history entry yet)", () => {
    sim.send("SUBMIT");
    expect(sim.pendingDecision).not.toBeNull();
    const reverted = sim.undo();
    expect(reverted).toBe(true);
    expect(sim.pendingDecision).toBeNull();
    // History was not pushed — undo again should be false
    expect(sim.undo()).toBe(false);
  });

  it("undo() after decide() reverts the committed transition", () => {
    sim.send("SUBMIT");
    const fwdChoice = sim.pendingDecision!.choices.find((c) => !c.isSelfLoop)!;
    sim.decide(fwdChoice.targetId);
    expect(sim.path).toBe("form_bpkb_review");
    sim.undo();
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
  });

  it("cancelDecision() clears pending without advancing", () => {
    sim.send("SUBMIT");
    sim.cancelDecision();
    expect(sim.pendingDecision).toBeNull();
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
  });

  it("reset() clears pending decision", () => {
    sim.send("SUBMIT");
    sim.reset();
    expect(sim.pendingDecision).toBeNull();
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
  });

  it("send() returns false while a decision is pending", () => {
    sim.send("SUBMIT");
    expect(sim.send("TERMINATE")).toBe(false);
    expect(sim.path).toBe(BPKB_INITIAL_PATH);
  });

  it("TERMINATE (single unique target) does not trigger a decision", () => {
    sim.send("TERMINATE");
    expect(sim.pendingDecision).toBeNull();
    expect(sim.path).toBe("done");
  });
});
