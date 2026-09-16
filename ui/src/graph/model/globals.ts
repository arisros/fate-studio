import type { Graph } from "../../types";

// detectGlobalEvents finds the high-degree transitions whose lines would clutter
// the chart — they get badged on nodes instead of drawn as edges. Two patterns:
//   • convergent (many sources → ≤2 targets): a global sink like TERMINATE.
//   • divergent  (≤2 sources → many targets): a hub like DETOUR_BACK / reassign.
// A backbone chain (many → many, e.g. FORWARD) is NOT badged.
export function detectGlobalEvents(graph: Graph): string[] {
  const src = new Map<string, Set<string>>();
  const tgt = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    s.add(v);
  };
  for (const e of graph.edges) {
    add(src, e.event, e.source);
    add(tgt, e.event, e.target);
  }
  const states = new Set(graph.edges.map((e) => e.source)).size;
  const T = Math.max(3, Math.ceil(0.25 * states));
  const out: string[] = [];
  for (const ev of src.keys()) {
    const s = src.get(ev)!.size;
    const t = tgt.get(ev)!.size;
    const convergent = s >= T && t <= 2;
    const divergent = t >= T && s <= 2;
    if (convergent || divergent) out.push(ev);
  }
  return out.sort();
}
