import { describe, it, expect } from "vitest";
import {
  rowHandleId,
  sourceHandleId,
  rowCenterY,
  anchorRight,
  targetAnchor,
  sourceDy,
  TARGET_HANDLE_ID,
  COMPACT_SOURCE_ID,
  HANDLE_GAP,
} from "./handles";
import { HEADER_H, ROW_H } from "./sizing";

describe("handle geometry", () => {
  it("row handle ids are stable and edge-keyed", () => {
    expect(rowHandleId("e1")).toBe("out:e1");
    expect(rowHandleId("e1")).not.toBe(rowHandleId("e2"));
    expect(TARGET_HANDLE_ID).toBe("in");
  });

  it("source handle id depends on show-mode", () => {
    expect(sourceHandleId("e1", false)).toBe("out:e1");
    expect(sourceHandleId("e1", true)).toBe(COMPACT_SOURCE_ID);
  });

  it("row centers sit at the middle of each row band", () => {
    expect(rowCenterY(0)).toBe(HEADER_H + 0.5 * ROW_H);
    expect(rowCenterY(1) - rowCenterY(0)).toBe(ROW_H);
  });

  it("right anchor is HANDLE_GAP outside the right edge", () => {
    const r = { x: 100, y: 200, w: 230, h: 120 };
    expect(anchorRight(r, rowCenterY(0))).toEqual({ x: 330 + HANDLE_GAP, y: 200 + rowCenterY(0) });
  });

  it("target anchor is HANDLE_GAP outside the left edge at vertical center", () => {
    const r = { x: 100, y: 200, w: 230, h: 120 };
    expect(targetAnchor(r)).toEqual({ x: 100 - HANDLE_GAP, y: 260 });
  });

  it("sourceDy uses row center in fields mode, node center compact", () => {
    expect(sourceDy(2, 200, false)).toBe(rowCenterY(2));
    expect(sourceDy(2, 200, true)).toBe(100);
  });
});
