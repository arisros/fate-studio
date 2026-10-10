import { describe, it, expect } from "vitest";
import type { Graph } from "../../types";
import { buildViewModel } from "./viewModel";
import { tipFor } from "./tooltip";

const graph: Graph = {
  id: "m",
  initial: "idle",
  nodes: [
    { id: "idle", label: "idle", path: "idle", type: "atomic", parent: "", initial: true, entry: ["reset", ""], exit: ["log"] },
    { id: "work", label: "work", path: "work", type: "compound", parent: "", initial: false },
    { id: "work.run", label: "run", path: "work.run", type: "atomic", parent: "work", initial: true },
    { id: "work.hist", label: "hist", path: "work.hist", type: "history", parent: "work", initial: false, history: "deep" },
  ],
  edges: [
    { id: "e1", source: "idle", event: "GO", target: "work.run", guard: "ready", actions: ["arm", " "] },
    { id: "e2", source: "idle", event: "TICK", target: "idle" },
    { id: "e3", source: "work.run", event: "NOTE", target: "work.run", internal: true },
  ],
};
const vm = buildViewModel(graph);

describe("tipFor", () => {
  it("describes a node by path, type and its entry and exit actions", () => {
    expect(tipFor(vm, "node", "idle")).toEqual({
      name: "idle",
      rows: [
        { label: "type", value: "atomic, initial" },
        { label: "actions", value: "entry reset, exit log" },
      ],
    });
  });

  it("names a nested node by its full path and omits empty rows", () => {
    expect(tipFor(vm, "node", "work.run")).toEqual({
      name: "work.run",
      rows: [{ label: "type", value: "atomic, initial" }],
    });
  });

  it("says which kind of history a history node keeps", () => {
    expect(tipFor(vm, "node", "work.hist")?.rows[0]).toEqual({ label: "type", value: "deep history" });
  });

  it("describes an edge by event, type, actions, guard and target", () => {
    expect(tipFor(vm, "edge", "e1")).toEqual({
      name: "GO",
      rows: [
        { label: "type", value: "transition" },
        { label: "actions", value: "arm" },
        { label: "guard", value: "ready" },
        { label: "target", value: "work.run" },
      ],
    });
  });

  it("explains a fallback branch and warns about one that never fires", () => {
    const routed = buildViewModel({
      id: "m",
      initial: "a",
      nodes: [
        { id: "a", label: "a", path: "a", type: "atomic", parent: "", initial: true },
        { id: "b", label: "b", path: "b", type: "atomic", parent: "", initial: false },
      ],
      edges: [
        { id: "r1", source: "a", event: "ROUTE", target: "b", guard: "fast" },
        { id: "r2", source: "a", event: "ROUTE", target: "b", fallback: true },
        { id: "r3", source: "a", event: "ROUTE", target: "a", shadowed: true },
      ],
    });
    expect(tipFor(routed, "edge", "r2")?.rows).toContainEqual({
      label: "guard",
      value: "otherwise: taken when the guards before it refuse",
    });
    expect(tipFor(routed, "edge", "r3")?.rows).toContainEqual({
      label: "warning",
      value: "never fires: an earlier ROUTE transition has no guard",
    });
    expect(tipFor(routed, "edge", "r1")?.rows.map((r) => r.label)).not.toContain("warning");
  });

  it("tells self and internal transitions apart", () => {
    expect(tipFor(vm, "edge", "e2")?.rows[0].value).toBe("self");
    expect(tipFor(vm, "edge", "e3")?.rows[0].value).toBe("internal");
  });

  it("is null for an id the chart does not have", () => {
    expect(tipFor(vm, "node", "nope")).toBeNull();
    expect(tipFor(vm, "edge", "nope")).toBeNull();
  });
});
