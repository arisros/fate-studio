// Node geometry constants and leaf sizing. Pure — no React, no DOM.
// A leaf node is a header (state name + type/initial badges) stacked above a
// column of transition rows, with a little bottom padding.

export const NODE_W = 280;
export const HEADER_H = 40; // header band height
export const ROW_H = 36; // one transition row (tall enough for event + optional action sub-line)
export const PAD = 10; // bottom padding under the last row

// ELK layout caps at this many rows; extra rows appear via overflow-y scroll inside the node.
export const MAX_LAYOUT_ROWS = 10;

/** Height of a leaf node showing `rowCount` transition rows. */
export function leafHeight(rowCount: number): number {
  return HEADER_H + Math.min(rowCount, MAX_LAYOUT_ROWS) * ROW_H + PAD;
}
