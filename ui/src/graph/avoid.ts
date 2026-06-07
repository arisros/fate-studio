// Obstacle-avoiding edge routing via libavoid-js (C++ libavoid compiled to WASM).
// initAvoid() must be awaited once before constructing AvoidRouter.
import { AvoidLib } from "libavoid-js";
import type { Pt } from "./flow";

export interface Rect { x: number; y: number; w: number; h: number; }

export interface EdgeMeta {
  id: string;
  source: string;
  target: string;
  selfLoop?: boolean;
  global?: boolean;
}

let _initPromise: Promise<void> | null = null;

// WASM is served at /assets/libavoid.wasm in both dev (Vite middleware) and prod (copied by build plugin).
export async function initAvoid(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = AvoidLib.load("/assets/libavoid.wasm");
  return _initPromise;
}

function makeRect(r: Rect) {
  const Av = AvoidLib.getInstance();
  return new Av.Rectangle(new Av.Point(r.x, r.y), new Av.Point(r.x + r.w, r.y + r.h));
}

function connEnd(x: number, y: number) {
  const Av = AvoidLib.getInstance();
  return new Av.ConnEnd(new Av.Point(x, y));
}

function srcEnd(r: Rect) { return connEnd(r.x + r.w - 3, r.y + r.h / 2); }
function dstEnd(r: Rect) { return connEnd(r.x + 3,       r.y + r.h / 2); }

function readRoute(polyline: { size(): number; at(i: number): { x: number; y: number } }): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < polyline.size(); i++) {
    const p = polyline.at(i);
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
}

export class AvoidRouter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _router: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _shapes = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _conns  = new Map<string, any>();

  constructor() {
    const Av = AvoidLib.getInstance();
    this._router = new Av.Router(Av.RouterFlag.OrthogonalRouting.value);
    const rp = Av.RoutingParameter;
    const ro = Av.RoutingOption;
    this._router.setRoutingParameter(rp.shapeBufferDistance,  24);
    this._router.setRoutingParameter(rp.idealNudgingDistance, 14);
    this._router.setRoutingParameter(rp.segmentPenalty,       12);
    this._router.setRoutingOption(ro.nudgeOrthogonalSegmentsConnectedToShapes, true);
    this._router.setRoutingOption(ro.nudgeOrthogonalTouchingColinearSegments,  true);
    this._router.setRoutingOption(ro.performUnifyingNudgingPreprocessingStep,   true);
  }

  /** Sync node bounding boxes as routing obstacles. */
  setShapes(rects: Map<string, Rect>): void {
    for (const [id, shape] of this._shapes) {
      if (!rects.has(id)) { this._router.deleteShape(shape); this._shapes.delete(id); }
    }
    for (const [id, r] of rects) {
      if (this._shapes.has(id)) {
        this._router.moveShape_poly(this._shapes.get(id)!, makeRect(r), true);
      } else {
        this._shapes.set(id, new (AvoidLib.getInstance().ShapeRef)(this._router, makeRect(r)));
      }
    }
  }

  /** Register connectors for non-self-loop, non-global edges. */
  setConnectors(edges: EdgeMeta[], rects: Map<string, Rect>): void {
    const Av = AvoidLib.getInstance();
    const currentIds = new Set(edges.map(e => e.id));
    for (const [id, conn] of this._conns) {
      if (!currentIds.has(id)) { this._router.deleteConnector(conn); this._conns.delete(id); }
    }
    for (const e of edges) {
      if (e.selfLoop || e.global || this._conns.has(e.id)) continue;
      const sr = rects.get(e.source), dr = rects.get(e.target);
      if (!sr || !dr) continue;
      this._conns.set(e.id, new Av.ConnRef(this._router, srcEnd(sr), dstEnd(dr)));
    }
  }

  /** Update all connector endpoints after node positions change (drag). */
  updateAllEndpoints(edges: EdgeMeta[], rects: Map<string, Rect>): void {
    for (const e of edges) {
      if (e.selfLoop || e.global) continue;
      const conn = this._conns.get(e.id);
      if (!conn) continue;
      const sr = rects.get(e.source), dr = rects.get(e.target);
      if (!sr || !dr) continue;
      conn.setSourceEndpoint(srcEnd(sr));
      conn.setDestEndpoint(dstEnd(dr));
    }
  }

  /** Run one routing pass; returns point lists keyed by edge id. */
  route(): Map<string, Pt[]> {
    this._router.processTransaction();
    const out = new Map<string, Pt[]>();
    for (const [id, conn] of this._conns) out.set(id, readRoute(conn.displayRoute()));
    return out;
  }

  destroy(): void {
    for (const c of this._conns.values())  this._router.deleteConnector(c);
    for (const s of this._shapes.values()) this._router.deleteShape(s);
    this._router.delete();
    this._conns.clear();
    this._shapes.clear();
  }
}
