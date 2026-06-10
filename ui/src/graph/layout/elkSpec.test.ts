import { describe, it, expect } from "vitest";
import { buildElkSpec, containerLayout } from "./elkSpec";
import { buildViewModel } from "../model/viewModel";
import { NODE_W, leafHeight } from "../model/sizing";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Graph } from "../../types";
import esign from "../__fixtures__/esign.graph.json";

const vm = buildViewModel(esign as Graph);
const spec = buildElkSpec(vm);

function find(root: ElkNode, id: string): ElkNode | undefined {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = find(c, id);
    if (hit) return hit;
  }
  return undefined;
}

describe("buildElkSpec (esign)", () => {
  it("nests the parallel root under the spec root", () => {
    expect(spec.children?.map((c) => c.id)).toContain("s_active");
    const par = find(spec, "s_active")!;
    expect(par.children?.map((c) => c.id).sort()).toEqual([
      "s_active_followup",
      "s_active_main",
      "s_active_return",
    ]);
  });

  it("sizes leaves by their row count", () => {
    const leaf = find(spec, "s_active_return_form_bpkb_return")!;
    expect(leaf.width).toBe(NODE_W);
    expect(leaf.height).toBe(leafHeight(3)); // FILL_REJECTION, RETURN_BPKB, TERMINATE
  });

  it("excludes self-loops and globals from ELK edges", () => {
    const ids = new Set((spec.edges ?? []).map((e) => e.id));
    // STATUS_CALLBACK is a self-loop → not an ELK edge.
    expect([...ids].some((id) => id.includes("STATUS_CALLBACK"))).toBe(false);
    // RETURN_BPKB is a real cross-node edge → present.
    expect([...ids].some((id) => id.includes("RETURN_BPKB"))).toBe(true);
  });

  it("parallel containers omit the header inset", () => {
    const par = vm.nodes.find((n) => n.node.id === "s_active")!;
    expect(containerLayout(par)["elk.padding"]).toContain("top=60");
  });
});
