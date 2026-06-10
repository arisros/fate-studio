import { describe, it, expect } from "vitest";
import { leafHeight, HEADER_H, ROW_H, PAD } from "./sizing";

describe("leafHeight", () => {
  it("is header + padding with no rows", () => {
    expect(leafHeight(0)).toBe(HEADER_H + PAD);
  });
  it("adds one ROW_H per row", () => {
    expect(leafHeight(3)).toBe(HEADER_H + 3 * ROW_H + PAD);
    expect(leafHeight(5) - leafHeight(4)).toBe(ROW_H);
  });
});
