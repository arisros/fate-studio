// Obstacle-avoiding edge routing via libavoid-js (C++ libavoid → WASM).
// initRouter() must be awaited once before constructing AvoidRouter.
//
// Design for "re-route on every drag move, but stay light":
//   • setScene() builds all shapes + connectors once after layout.
//   • sync() moves ONLY the shapes whose absolute rect changed since the last
//     frame and updates just those edges' endpoints — so a leaf drag touches one
//     shape, a container drag touches its subtree, and nothing else is rebuilt.
//   • route() runs one libavoid transaction and reads every connector's polyline
//     (libavoid re-routes any edge an obstacle move affected, not just moved ones).
//
// Horizontal-exit guarantee:
//   libavoid anchors are placed ROUTER_PAD px outside the node border (> SHAPE_BUFFER),
//   so the anchor is outside the shape's clearance zone and libavoid's first segment
//   from the anchor is naturally horizontal. route() then prepends/appends the visual
//   HANDLE_GAP handle-dot position so the drawn path always has a horizontal stub from
//   the dot to the libavoid anchor — ensuring edges exit handle circles horizontally.

import { AvoidLib } from "libavoid-js";
import type { Pt, Rect } from "../model/handles";
import { HANDLE_GAP } from "../model/handles";
import { SHAPE_BUFFER, IDEAL_NUDGE, SEGMENT_PENALTY, WASM_URL, ROUTER_PAD } from "./libavoidConfig";

export interface RouterEdge {
  id: string;
  source: string;
  target: string;
  srcDy: number; // Y offset (from source node top) of this edge's output anchor
}

let _init: Promise<void> | null = null;
export function initRouter(): Promise<void> {
  if (!_init) _init = AvoidLib.load(WASM_URL);
  return _init;
}

function readRoute(poly: { size(): number; at(i: number): { x: number; y: number } }): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < poly.size(); i++) {
    const p = poly.at(i);
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
}

function sameRect(a: Rect | undefined, b: Rect): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Visual endpoint positions (at HANDLE_GAP) are stored per edge so route()
 *  can prepend/append them to guarantee horizontal entry/exit at the handle dots. */
interface VisAnchors {
  src: Pt;
  dst: Pt;
}

export class AvoidRouter {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private _r: any;
  private _shapes = new Map<string, any>();
  private _conns = new Map<string, any>();
  /* eslint-enable @typescript-eslint/no-explicit-any */
  private _bySource = new Map<string, RouterEdge[]>();
  private _byTarget = new Map<string, RouterEdge[]>();
  private _last = new Map<string, Rect>();
  private _vis = new Map<string, VisAnchors>();

  constructor() {
    const Av = AvoidLib.getInstance();
    this._r = new Av.Router(Av.RouterFlag.OrthogonalRouting.value);
    const rp = Av.RoutingParameter;
    const ro = Av.RoutingOption;
    this._r.setRoutingParameter(rp.shapeBufferDistance, SHAPE_BUFFER);
    this._r.setRoutingParameter(rp.idealNudgingDistance, IDEAL_NUDGE);
    this._r.setRoutingParameter(rp.segmentPenalty, SEGMENT_PENALTY);
    this._r.setRoutingOption(ro.nudgeOrthogonalSegmentsConnectedToShapes, true);
    this._r.setRoutingOption(ro.nudgeOrthogonalTouchingColinearSegments, true);
    this._r.setRoutingOption(ro.performUnifyingNudgingPreprocessingStep, true);
  }

  /**
   * Full (re)initialization after a layout.
   * obstacles — leaf nodes only (shapes libavoid routes around, NOT containers).
   * anchors   — full abs map for connector endpoint positions (includes containers as sources).
   */
  setScene(obstacles: Map<string, Rect>, anchors: Map<string, Rect>, edges: RouterEdge[]): void {
    const Av = AvoidLib.getInstance();
    // shapes: leaf obstacles only — add new, move existing, delete gone
    for (const [id, s] of this._shapes) {
      if (!obstacles.has(id)) {
        this._r.deleteShape(s);
        this._shapes.delete(id);
      }
    }
    for (const [id, r] of obstacles) {
      if (this._shapes.has(id)) this._r.moveShape_poly(this._shapes.get(id)!, this.box(r), true);
      else this._shapes.set(id, new Av.ShapeRef(this._r, this.box(r)));
    }
    // connectors — endpoints use ROUTER_PAD anchors, visual stubs stored in _vis
    this._bySource = group(edges, (e) => e.source);
    this._byTarget = group(edges, (e) => e.target);
    const ids = new Set(edges.map((e) => e.id));
    for (const [id, c] of this._conns) {
      if (!ids.has(id)) {
        this._r.deleteConnector(c);
        this._conns.delete(id);
        this._vis.delete(id);
      }
    }
    for (const e of edges) {
      const sr = anchors.get(e.source);
      const dr = anchors.get(e.target);
      if (!sr || !dr) continue;
      this._vis.set(e.id, this.visAnchors(sr, e.srcDy, dr));
      const existing = this._conns.get(e.id);
      if (existing) {
        existing.setSourceEndpoint(this.srcEnd(sr, e.srcDy));
        existing.setDestEndpoint(this.dstEnd(dr));
      } else {
        this._conns.set(e.id, new Av.ConnRef(this._r, this.srcEnd(sr, e.srcDy), this.dstEnd(dr)));
      }
    }
    this._last = new Map(anchors);
  }

  /**
   * Incremental update during drag.
   * Shape moves only if the node is a registered obstacle (leaf).
   * Connector endpoints update for any node that moved (compound sources aren't obstacles).
   */
  sync(abs: Map<string, Rect>): void {
    for (const [id, r] of abs) {
      if (sameRect(this._last.get(id), r)) continue;
      // move shape obstacle if registered
      const shape = this._shapes.get(id);
      if (shape) this._r.moveShape_poly(shape, this.box(r), true);
      // update connector endpoints and visual stubs for any connected edges
      for (const e of this._bySource.get(id) ?? []) {
        this._conns.get(e.id)?.setSourceEndpoint(this.srcEnd(r, e.srcDy));
        const vis = this._vis.get(e.id);
        if (vis) vis.src = { x: r.x + r.w + HANDLE_GAP, y: r.y + e.srcDy };
      }
      for (const e of this._byTarget.get(id) ?? []) {
        this._conns.get(e.id)?.setDestEndpoint(this.dstEnd(r));
        const vis = this._vis.get(e.id);
        if (vis) vis.dst = { x: r.x - HANDLE_GAP, y: r.y + r.h / 2 };
      }
    }
    this._last = new Map(abs);
  }

  /** Run one routing pass, read every connector's polyline, prepend/append visual handle dots. */
  route(): Map<string, Pt[]> {
    this._r.processTransaction();
    const out = new Map<string, Pt[]>();
    for (const [id, c] of this._conns) {
      const raw = readRoute(c.displayRoute());
      const vis = this._vis.get(id);
      if (vis && raw.length > 0) {
        // Prepend visual src dot + append visual dst dot.
        // Because the libavoid anchor has the same Y as the visual dot, the stub
        // (dot → anchor) is horizontal, guaranteeing a horizontal exit from each handle.
        out.set(id, [vis.src, ...raw, vis.dst]);
      } else {
        out.set(id, raw);
      }
    }
    return out;
  }

  destroy(): void {
    for (const c of this._conns.values()) this._r.deleteConnector(c);
    for (const s of this._shapes.values()) this._r.deleteShape(s);
    this._r.delete();
    this._conns.clear();
    this._shapes.clear();
    this._last.clear();
    this._vis.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private box(r: Rect): any {
    const Av = AvoidLib.getInstance();
    return new Av.Rectangle(new Av.Point(r.x, r.y), new Av.Point(r.x + r.w, r.y + r.h));
  }

  /** Libavoid source anchor: ROUTER_PAD outside the node border (> SHAPE_BUFFER) so the
   *  first libavoid segment is naturally horizontal (anchor is outside the buffer zone). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private srcEnd(r: Rect, dy: number): any {
    const Av = AvoidLib.getInstance();
    return new Av.ConnEnd(new Av.Point(r.x + r.w + ROUTER_PAD, r.y + dy));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dstEnd(r: Rect): any {
    const Av = AvoidLib.getInstance();
    return new Av.ConnEnd(new Av.Point(r.x - ROUTER_PAD, r.y + r.h / 2));
  }

  /** Visual endpoint positions at HANDLE_GAP — prepended/appended to create horizontal stubs. */
  private visAnchors(sr: Rect, srcDy: number, dr: Rect): VisAnchors {
    return {
      src: { x: sr.x + sr.w + HANDLE_GAP, y: sr.y + srcDy },
      dst: { x: dr.x - HANDLE_GAP, y: dr.y + dr.h / 2 },
    };
  }
}

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k) ?? [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}
