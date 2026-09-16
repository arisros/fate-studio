import { describe, it, expect } from "vitest";
import { resolvePath, evalField, evaluateGates } from "./gateEval";
import type { CondField, CondMeta } from "../../types";

describe("resolvePath", () => {
  const ctx = { score: 70, customer: { name: "Alice" }, active: true, zero: 0 };

  it("resolves top-level field", () => {
    expect(resolvePath(ctx, "$.score")).toBe(70);
  });
  it("resolves nested field", () => {
    expect(resolvePath(ctx, "$.customer.name")).toBe("Alice");
  });
  it("resolves falsy zero", () => {
    expect(resolvePath(ctx, "$.zero")).toBe(0);
  });
  it("returns undefined for missing field", () => {
    expect(resolvePath(ctx, "$.missing")).toBeUndefined();
  });
  it("returns undefined when intermediate is not an object", () => {
    expect(resolvePath(ctx, "$.score.sub")).toBeUndefined();
  });
  it("returns undefined for non-$ paths", () => {
    expect(resolvePath(ctx, "score")).toBeUndefined();
  });
  it("returns undefined for null context", () => {
    expect(resolvePath(null, "$.score")).toBeUndefined();
  });
  it("returns undefined for non-object context", () => {
    expect(resolvePath("hello", "$.score")).toBeUndefined();
  });
});

describe("evalField", () => {
  const f = (op: CondField["op"], value?: unknown): CondField => ({ path: "$", op, value });

  it("eq passes when equal", () => expect(evalField(f("eq", "a"), "a")).toBe("open"));
  it("eq closes when not equal", () => expect(evalField(f("eq", "a"), "b")).toBe("closed"));
  it("neq passes when different", () => expect(evalField(f("neq", "a"), "b")).toBe("open"));
  it("gt passes", () => expect(evalField(f("gt", 60), 70)).toBe("open"));
  it("gt closes when equal", () => expect(evalField(f("gt", 60), 60)).toBe("closed"));
  it("gte passes when equal", () => expect(evalField(f("gte", 60), 60)).toBe("open"));
  it("lt passes", () => expect(evalField(f("lt", 60), 50)).toBe("open"));
  it("lte passes when equal", () => expect(evalField(f("lte", 60), 60)).toBe("open"));
  it("in passes when contained", () => expect(evalField(f("in", ["a", "b"]), "a")).toBe("open"));
  it("in closes when absent", () => expect(evalField(f("in", ["a", "b"]), "c")).toBe("closed"));
  it("in wraps non-array value", () => expect(evalField(f("in", "a"), "a")).toBe("open"));
  it("truthy passes for 1", () => expect(evalField(f("truthy"), 1)).toBe("open"));
  it("truthy closes for 0", () => expect(evalField(f("truthy"), 0)).toBe("closed"));
  it("falsy passes for 0", () => expect(evalField(f("falsy"), 0)).toBe("open"));
  it("falsy closes for 1", () => expect(evalField(f("falsy"), 1)).toBe("closed"));
  it("returns unknown when actual is undefined", () => {
    expect(evalField(f("eq", 1), undefined)).toBe("unknown");
  });
  it("returns unknown for unknown op", () => {
    expect(evalField({ path: "$", op: "xyzzy" as CondField["op"] }, "x")).toBe("unknown");
  });
});

describe("evaluateGates", () => {
  const condMeta: CondMeta = {
    fields: [
      { path: "$.score", op: "gte", value: 60 },
      { path: "$.status", op: "eq", value: "approved" },
    ],
  };

  it("all open", () => {
    const result = evaluateGates(condMeta, { score: 65, status: "approved" });
    expect(result.map((r) => r.status)).toEqual(["open", "open"]);
  });
  it("first closed", () => {
    const result = evaluateGates(condMeta, { score: 50, status: "approved" });
    expect(result[0].status).toBe("closed");
    expect(result[1].status).toBe("open");
  });
  it("unknown when field missing", () => {
    const result = evaluateGates(condMeta, { status: "approved" });
    expect(result[0].status).toBe("unknown");
  });
  it("returns empty array when fields absent", () => {
    expect(evaluateGates({}, {})).toEqual([]);
  });
  it("actual value is included in result", () => {
    const result = evaluateGates(condMeta, { score: 70, status: "approved" });
    expect(result[0].actual).toBe(70);
    expect(result[1].actual).toBe("approved");
  });
});
