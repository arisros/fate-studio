// Minimum-penetration-vector (MPV) collision resolver — the xyflow node-collision
// approach. Pushes a dragged box out of every overlapping sibling along the axis
// of least penetration, keeping at least COLLISION_GAP between boxes. Pure.

export const COLLISION_GAP = 8;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function resolveCollisions(
  pos: { x: number; y: number },
  w: number,
  h: number,
  siblings: Box[],
  gap: number = COLLISION_GAP,
): { x: number; y: number } {
  let { x, y } = pos;
  for (const s of siblings) {
    const pR = x + w + gap - s.x; // dragged right into sibling left
    const pL = s.x + s.w + gap - x; // sibling right into dragged left
    const pB = y + h + gap - s.y; // dragged bottom into sibling top
    const pT = s.y + s.h + gap - y; // sibling bottom into dragged top
    if (pR <= 0 || pL <= 0 || pB <= 0 || pT <= 0) continue; // no overlap
    const minX = pR < pL ? -pR : pL;
    const minY = pB < pT ? -pB : pT;
    if (Math.abs(minX) <= Math.abs(minY)) x += minX;
    else y += minY;
  }
  return { x, y };
}
