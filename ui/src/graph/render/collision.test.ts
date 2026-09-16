import { describe, it, expect } from "vitest";
import { resolveCollisions, COLLISION_GAP } from "./collision";

describe("resolveCollisions (MPV)", () => {
  const box = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });

  it("leaves a non-overlapping position untouched", () => {
    const pos = { x: 500, y: 500 };
    expect(resolveCollisions(pos, 100, 100, [box(0, 0)])).toEqual(pos);
  });

  it("pushes out along the shorter axis", () => {
    // Dragged box at (90,10) overlaps sibling at (0,0) by 10 on X, 90 on Y → push X.
    const out = resolveCollisions({ x: 90, y: 10 }, 100, 100, [box(0, 0)]);
    expect(out.y).toBe(10);
    expect(out.x).toBe(100 + COLLISION_GAP); // sibling right (100) + gap
  });

  it("keeps at least the gap after resolving", () => {
    const sib = box(0, 0);
    const out = resolveCollisions({ x: 50, y: 5 }, 100, 100, [sib]);
    const sep = Math.max(
      sib.x - (out.x + 100),
      out.x - (sib.x + sib.w),
      sib.y - (out.y + 100),
      out.y - (sib.y + sib.h),
    );
    expect(sep).toBeGreaterThanOrEqual(COLLISION_GAP - 1e-9);
  });
});
