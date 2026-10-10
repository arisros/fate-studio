import type { Rect } from "./handles";

// Viewport maths for the first view of a chart. Pure — no React, no DOM.

/** The first view never opens further out than this. */
export const MIN_FIT_ZOOM = 0.35;
/** A small chart is not blown up past this. */
export const MAX_FIT_ZOOM = 1.2;
const PAD = 0.08;

// State names are drawn larger as the chart zooms out, so they keep this much
// of their natural size on screen for as long as the header has room.
const LABEL_HOLD_ZOOM = 0.75;
const MAX_LABEL_SCALE = LABEL_HOLD_ZOOM / MIN_FIT_ZOOM;

/** Factor to draw state names at for `zoom`, 1 when they are readable as is. */
export function labelScale(zoom: number): number {
  return Math.min(MAX_LABEL_SCALE, Math.max(1, LABEL_HOLD_ZOOM / zoom));
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export function boundsOf(rects: Iterable<Rect>): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// One axis at a fixed zoom: center the chart when it fits, otherwise center the
// anchor and stop at the chart's edge so the view never opens on empty canvas.
function axis(start: number, size: number, anchorMid: number, view: number, zoom: number): number {
  const pad = view * PAD;
  if (size * zoom <= view - 2 * pad) return view / 2 - (start + size / 2) * zoom;
  const centered = view / 2 - anchorMid * zoom;
  const max = pad - start * zoom;
  const min = view - pad - (start + size) * zoom;
  return Math.min(max, Math.max(min, centered));
}

/**
 * The viewport that shows the whole chart when that needs no less than
 * MIN_FIT_ZOOM, and otherwise that zoom around `anchor` (the active or initial
 * state).
 */
export function fitViewport(bounds: Rect, anchor: Rect, width: number, height: number): Viewport {
  const inner = 1 - 2 * PAD;
  const whole = Math.min((width * inner) / bounds.w, (height * inner) / bounds.h);
  const zoom = Math.min(MAX_FIT_ZOOM, Math.max(MIN_FIT_ZOOM, whole));
  return {
    x: axis(bounds.x, bounds.w, anchor.x + anchor.w / 2, width, zoom),
    y: axis(bounds.y, bounds.h, anchor.y + anchor.h / 2, height, zoom),
    zoom,
  };
}
