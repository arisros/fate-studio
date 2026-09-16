import type { CondMeta, Graph, GraphNode } from "../../types";

/**
 * Client-side state machine interpreter using only the static Graph data.
 * Guards are skipped (they are opaque strings — not evaluable in the browser).
 * Useful for exploring any machine structurally without a live Go actor.
 *
 * When an event has multiple distinct target states (guarded transitions), the
 * simulator surfaces a `pendingDecision` instead of auto-advancing, letting the
 * user pick which branch to follow. This avoids silently picking the first
 * (often a self-loop) when the "real" target depends on an unevaluated guard.
 */
export class VirtualSimulator {
  private nodeById: Map<string, GraphNode>;
  private nodeByPath: Map<string, GraphNode>;
  private _path: string;
  private _history: string[] = [];
  private _pendingDecision: PendingDecision | null = null;

  constructor(private graph: Graph) {
    this.nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    this.nodeByPath = new Map(graph.nodes.map((n) => [n.path, n]));
    this._path = this.enterNode(this.graph.initial);
  }

  get path(): string {
    return this._path;
  }

  /** Non-null when the last send() found multiple distinct target states. */
  get pendingDecision(): PendingDecision | null {
    return this._pendingDecision;
  }

  /**
   * Send an event.
   *
   * For parallel paths each region is resolved independently (inner-first).
   * For simple paths: if the event has multiple distinct targets (guarded
   * transitions), sets `pendingDecision` without advancing. The caller must
   * invoke `decide(targetId)` to commit the choice.
   *
   * Returns true when the event was consumed (including when a decision is
   * pending). Returns false when the event is unknown in the active state.
   */
  send(event: string): boolean {
    if (this._pendingDecision) return false; // must resolve first

    const regions = this._path.split(" | ");

    if (regions.length === 1) {
      // Simple path: collect all unique targets and show decision if needed.
      const choices = this.regionChoices(regions[0].trim(), event, true);
      if (!choices || choices.length === 0) return false;
      if (choices.length === 1) {
        this._history.push(this._path);
        this._path = choices[0].targetPath;
      } else {
        this._pendingDecision = { event, choices };
      }
      return true;
    }

    // Parallel: resolve each region independently (no decision UI for parallel).
    let consumed = false;
    const newRegions = regions.map((r) => {
      const result = this.tryRegionTransition(r.trim(), event, false);
      if (result !== null) { consumed = true; return result; }
      return r.trim();
    });
    if (consumed) {
      this._history.push(this._path);
      this._path = newRegions.join(" | ");
      return true;
    }

    // Bubble past the parallel boundary to ancestors.
    const firstNode = this.nodeByPath.get(regions[0].trim());
    let cur = firstNode ? this.getParallelAncestor(firstNode) : undefined;
    cur = cur?.parent ? this.nodeById.get(cur.parent) : undefined;
    while (cur) {
      const edge = this.graph.edges.find((e) => e.source === cur!.id && e.event === event);
      if (edge) {
        this._history.push(this._path);
        this._path = this.enterNode(edge.target);
        return true;
      }
      cur = cur.parent ? this.nodeById.get(cur.parent) : undefined;
    }
    return false;
  }

  /**
   * Commit a pending decision. `targetId` must match one of the choices
   * returned in `pendingDecision.choices`. Returns false if there is no
   * pending decision or the targetId is unknown.
   */
  decide(targetId: string): boolean {
    if (!this._pendingDecision) return false;
    const choice = this._pendingDecision.choices.find((c) => c.targetId === targetId);
    if (!choice) return false;
    this._history.push(this._path);
    this._path = choice.targetPath;
    this._pendingDecision = null;
    return true;
  }

  /** Cancel a pending decision without advancing (equivalent to dismissing the picker). */
  cancelDecision(): void {
    this._pendingDecision = null;
  }

  /** Events valid from the current active path (all regions + their ancestors). */
  availableEvents(): string[] {
    const seen = new Set<string>();
    for (const region of this._path.split(" | ")) {
      let cur = this.nodeByPath.get(region.trim());
      while (cur) {
        for (const e of this.graph.edges) {
          if (e.source === cur.id) seen.add(e.event);
        }
        if (cur.type === "parallel") break;
        cur = cur.parent ? this.nodeById.get(cur.parent) : undefined;
      }
    }
    return [...seen].sort();
  }

  /**
   * Undo the last committed transition. When a decision is pending, cancels
   * it instead (no history entry was recorded yet). Returns false only when
   * both there's no pending decision AND the history is empty.
   */
  undo(): boolean {
    if (this._pendingDecision) {
      this._pendingDecision = null;
      return true;
    }
    if (!this._history.length) return false;
    this._path = this._history.pop()!;
    return true;
  }

  /** Reset to the machine's initial state, clearing history and any pending decision. */
  reset(): void {
    this._history = [];
    this._pendingDecision = null;
    this._path = this.enterNode(this.graph.initial);
  }

  /**
   * Collect all unique target choices reachable from a region leaf via `event`.
   * Walks from the leaf upward — stops at the first node that owns matching edges
   * and deduplicates by resolved `targetPath`. Returns null when the event is
   * unrecognised in this path; returns an empty array when no edge found.
   */
  private regionChoices(
    regionPath: string,
    event: string,
    crossParallel: boolean,
  ): DecisionChoice[] | null {
    let cur = this.nodeByPath.get(regionPath);
    while (cur) {
      if (!crossParallel && cur.type === "parallel") break;
      const matching = this.graph.edges.filter(
        (e) => e.source === cur!.id && e.event === event,
      );
      if (matching.length > 0) {
        const seen = new Map<string, DecisionChoice>(); // targetPath → choice
        for (const edge of matching) {
          const targetPath = this.enterNode(edge.target);
          if (!seen.has(targetPath)) {
            const isSelf = targetPath === regionPath;
            const label = isSelf
              ? `stay (${regionPath.split(".").pop() ?? regionPath})`
              : (this.nodeById.get(edge.target)?.label ?? edge.target);
            seen.set(targetPath, {
              targetId: edge.target,
              targetPath,
              label,
              isSelfLoop: isSelf,
              condMeta: edge.condMeta,
            });
          }
        }
        return [...seen.values()];
      }
      cur = cur.parent ? this.nodeById.get(cur.parent) : undefined;
    }
    return null;
  }

  /**
   * Walk from a region leaf upward, picking the FIRST matching edge.
   * Used for parallel-region resolution where per-region decisions aren't shown.
   */
  private tryRegionTransition(
    regionPath: string,
    event: string,
    crossParallel: boolean,
  ): string | null {
    let cur = this.nodeByPath.get(regionPath);
    while (cur) {
      if (!crossParallel && cur.type === "parallel") break;
      const edge = this.graph.edges.find((e) => e.source === cur!.id && e.event === event);
      if (edge) return this.enterNode(edge.target);
      cur = cur.parent ? this.nodeById.get(cur.parent) : undefined;
    }
    return null;
  }

  private getParallelAncestor(node: GraphNode): GraphNode | undefined {
    let cur: GraphNode | undefined = node;
    while (cur) {
      if (cur.type === "parallel") return cur;
      cur = cur.parent ? this.nodeById.get(cur.parent) : undefined;
    }
    return undefined;
  }

  private enterNode(nodeId: string): string {
    const node = this.nodeById.get(nodeId);
    if (!node) return "";
    if (node.type === "parallel") {
      const children = this.graph.nodes.filter((n) => n.parent === nodeId);
      const regions = children.map((c) => this.enterNode(c.id)).filter(Boolean);
      return regions.join(" | ");
    }
    if (node.type === "compound") {
      const initial = this.graph.nodes.find((n) => n.parent === nodeId && n.initial);
      if (initial) return this.enterNode(initial.id);
    }
    return node.path;
  }
}

// ─── Public types ────────────────────────────────────────────────────────────

/** One selectable branch when a pending decision is active. */
export interface DecisionChoice {
  targetId: string;    // edge.target — pass to decide()
  targetPath: string;  // resolved path after entering the target node
  label: string;       // human display name
  isSelfLoop: boolean; // target is the same as the current state
  condMeta?: CondMeta; // gate hints, when the machine author declared Gates()
}

/** Set when send() encounters multiple unique targets for a guarded event. */
export interface PendingDecision {
  event: string;
  choices: DecisionChoice[];
}
