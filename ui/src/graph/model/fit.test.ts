import { describe, it, expect } from "vitest";
import { boundsOf, fitViewport, labelScale, MAX_FIT_ZOOM, MIN_FIT_ZOOM } from "./fit";

const W = 1200;
const H = 800;

describe("boundsOf", () => {
  it("spans every rect", () => {
    expect(boundsOf([{ x: 10, y: 20, w: 100, h: 50 }, { x: 300, y: -40, w: 80, h: 60 }])).toEqual({
      x: 10,
      y: -40,
      w: 370,
      h: 110,
    });
  });
  it("is null for no rects", () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe("fitViewport", () => {
  it("shows the whole chart, centered, when it fits above the minimum zoom", () => {
    const b = { x: 0, y: 0, w: 2000, h: 900 };
    const v = fitViewport(b, { x: 0, y: 0, w: 280, h: 40 }, W, H);
    expect(v.zoom).toBeGreaterThan(MIN_FIT_ZOOM);
    expect(v.zoom).toBeLessThan(0.75);
    expect(v.x + (b.w * v.zoom) / 2).toBeCloseTo(W / 2);
    expect(v.y + (b.h * v.zoom) / 2).toBeCloseTo(H / 2);
    expect(v.x).toBeGreaterThan(0);
    expect(v.x + b.w * v.zoom).toBeLessThan(W);
  });

  it("does not blow a small chart up past the cap", () => {
    const v = fitViewport({ x: 0, y: 0, w: 280, h: 40 }, { x: 0, y: 0, w: 280, h: 40 }, W, H);
    expect(v.zoom).toBe(MAX_FIT_ZOOM);
  });

  it("holds the minimum zoom for a chart too large to fit", () => {
    const v = fitViewport({ x: 0, y: 0, w: 6000, h: 3000 }, { x: 0, y: 0, w: 280, h: 40 }, W, H);
    expect(v.zoom).toBe(MIN_FIT_ZOOM);
  });

  it("opens a large chart on its anchor without leaving the chart", () => {
    const b = { x: 0, y: 0, w: 6000, h: 3000 };
    const start = fitViewport(b, { x: 0, y: 0, w: 280, h: 40 }, W, H);
    expect(start.x).toBeGreaterThan(0);
    expect(start.x).toBeLessThanOrEqual(W * 0.1);
    expect(start.y).toBeGreaterThan(0);

    const mid = { x: 3000, y: 1500, w: 280, h: 40 };
    const v = fitViewport(b, mid, W, H);
    expect((mid.x + mid.w / 2) * v.zoom + v.x).toBeCloseTo(W / 2);
    expect((mid.y + mid.h / 2) * v.zoom + v.y).toBeCloseTo(H / 2);

    const end = fitViewport(b, { x: 5720, y: 2960, w: 280, h: 40 }, W, H);
    expect(end.x + b.w * end.zoom).toBeGreaterThanOrEqual(W * 0.9);
    expect(end.x + b.w * end.zoom).toBeLessThan(W);
  });

  it("centers the axis that fits while anchoring the one that does not", () => {
    const b = { x: 0, y: 0, w: 6000, h: 300 };
    const v = fitViewport(b, { x: 0, y: 0, w: 280, h: 40 }, W, H);
    expect(v.y + (b.h * v.zoom) / 2).toBeCloseTo(H / 2);
  });
});

describe("labelScale", () => {
  it("leaves names alone at a readable zoom", () => {
    expect(labelScale(1)).toBe(1);
    expect(labelScale(0.75)).toBe(1);
    expect(labelScale(2)).toBe(1);
  });
  it("keeps names the same size on screen as the chart zooms out", () => {
    expect(labelScale(0.5) * 0.5).toBeCloseTo(0.75);
    expect(labelScale(MIN_FIT_ZOOM) * MIN_FIT_ZOOM).toBeCloseTo(0.75);
  });
  it("stops growing below the minimum fit zoom, where the header has no more room", () => {
    expect(labelScale(0.1)).toBe(labelScale(MIN_FIT_ZOOM));
  });
});
