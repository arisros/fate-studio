import { describe, it, expect } from "vitest";
import { detectGlobalEvents } from "./globals";
import type { Graph } from "../../types";
import esign from "../__fixtures__/esign.graph.json";
import bpkb from "../__fixtures__/bpkb-review.graph.json";
import survey from "../__fixtures__/survey.graph.json";
import underwriting from "../__fixtures__/underwriting.graph.json";

describe("detectGlobalEvents (real machines)", () => {
  it("esign has no global fan events", () => {
    expect(detectGlobalEvents(esign as Graph)).toEqual([]);
  });
  it("bpkb-review badges TERMINATE", () => {
    expect(detectGlobalEvents(bpkb as Graph)).toEqual(["TERMINATE"]);
  });
  it("survey badges high-degree hubs", () => {
    expect(detectGlobalEvents(survey as Graph)).toEqual([
      "DETOUR_BACK",
      "REQUEST_REASSIGNMENT",
      "RESCHEDULE",
      "RESCORING_REJECTED",
    ]);
  });
  it("underwriting badges convergent events", () => {
    expect(detectGlobalEvents(underwriting as Graph)).toEqual(["APPROVAL_SUBMIT", "CANCELLATION_REQUEST"]);
  });
});
