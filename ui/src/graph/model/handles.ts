import { HEADER_H, ROW_H } from "./sizing";

// Per-row handle geometry. This module is the SINGLE source of truth for where a
// transition's output anchor sits, so the rendered <Handle> and the libavoid edge
// origin always agree. A node has one target handle on the left and, in fields
// mode, one source handle per transition row on the right; in compact (label)
// mode a single source handle at the node's vertical center.

// How far handles sit outside the node border. Must match the CSS translateX in
// nodes.tsx so the rendered dot and the libavoid edge anchor coincide.
export const HANDLE_GAP = 12;

export const TARGET_HANDLE_ID = "in";
export const COMPACT_SOURCE_ID = "out";

/** Stable id for a row's source handle in fields mode, keyed by its edge. */
export function rowHandleId(edgeId: string): string {
  return `out:${edgeId}`;
}

/** The source handle id an edge connects to, depending on show-mode. */
export function sourceHandleId(edgeId: string, compact: boolean): string {
  return compact ? COMPACT_SOURCE_ID : rowHandleId(edgeId);
}

/** Vertical center (px from node top) of the row at `index`. */
export function rowCenterY(index: number): number {
  return HEADER_H + (index + 0.5) * ROW_H;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

/** Right-edge anchor at a given Y offset from the node top.
 *  HANDLE_GAP ensures the anchor meets the visible circle dot, not the node border. */
export function anchorRight(rect: Rect, dy: number): Pt {
  return { x: rect.x + rect.w + HANDLE_GAP, y: rect.y + dy };
}

/** West anchor for an incoming edge: left edge at the node's vertical center. */
export function targetAnchor(rect: Rect): Pt {
  return { x: rect.x - HANDLE_GAP, y: rect.y + rect.h / 2 };
}

/** Source Y offset for an edge: its row center in fields mode, node center compact. */
export function sourceDy(rowIndex: number, nodeHeight: number, compact: boolean): number {
  return compact ? nodeHeight / 2 : rowCenterY(rowIndex);
}
