import { describe, it, expect } from "vitest";
import { GUIDE_KEY, guideSeen, markGuideSeen, nextStep } from "./guide";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("guide storage", () => {
  it("is unseen until marked, then stays seen", () => {
    const s = memoryStore();
    expect(guideSeen(s)).toBe(false);
    markGuideSeen(s);
    expect(s.data.get(GUIDE_KEY)).toBe("seen");
    expect(guideSeen(s)).toBe(true);
  });

  it("treats a blocked or missing store as unseen and does not throw", () => {
    expect(guideSeen(blocked)).toBe(false);
    expect(() => markGuideSeen(blocked)).not.toThrow();
    expect(guideSeen(undefined)).toBe(false);
    expect(() => markGuideSeen(undefined)).not.toThrow();
  });
});

describe("nextStep", () => {
  it("walks the three steps and then ends", () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(1)).toBe(2);
    expect(nextStep(2)).toBeNull();
  });
});
