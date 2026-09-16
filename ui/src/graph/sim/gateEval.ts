import type { CondField, CondMeta } from "../../types";

export type GateStatus = "open" | "closed" | "unknown";

export interface FieldEval {
  field: CondField;
  status: GateStatus;
  actual: unknown; // resolved value from context; undefined when path not found
}

/**
 * Resolves a JSONPath-style selector against a context object.
 * Only simple dot-paths are supported (v1):
 *   "$.score"          → context.score
 *   "$.customer.name"  → context.customer?.name
 *
 * Returns undefined when:
 *   - path doesn't start with "$."
 *   - any intermediate segment is null / not an object
 *   - the final key is missing
 */
export function resolvePath(context: unknown, path: string): unknown {
  if (!path.startsWith("$.")) return undefined;
  const segments = path.slice(2).split(".");
  let cursor: unknown = context;
  for (const seg of segments) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

/**
 * Evaluates whether a single CondField's op passes against the resolved actual value.
 *
 * Returns "unknown" when actual is undefined (path not found) or when the
 * comparison throws (e.g. NaN coercion).
 */
export function evalField(field: CondField, actual: unknown): GateStatus {
  if (actual === undefined) return "unknown";
  const { op, value } = field;
  try {
    switch (op) {
      case "truthy":
        return actual ? "open" : "closed";
      case "falsy":
        return !actual ? "open" : "closed";
      // loose equality so "1" == 1 works when backend sends numbers as strings
      case "eq":
        // eslint-disable-next-line eqeqeq
        return actual == value ? "open" : "closed";
      case "neq":
        // eslint-disable-next-line eqeqeq
        return actual != value ? "open" : "closed";
      case "gt":
        return Number(actual) > Number(value) ? "open" : "closed";
      case "gte":
        return Number(actual) >= Number(value) ? "open" : "closed";
      case "lt":
        return Number(actual) < Number(value) ? "open" : "closed";
      case "lte":
        return Number(actual) <= Number(value) ? "open" : "closed";
      case "in": {
        const arr = Array.isArray(value) ? value : [value];
        return arr.includes(actual) ? "open" : "closed";
      }
      default:
        return "unknown";
    }
  } catch {
    return "unknown";
  }
}

/**
 * Evaluates all fields in a CondMeta against the given context.
 * Returns one FieldEval per field in declaration order.
 */
export function evaluateGates(condMeta: CondMeta, context: unknown): FieldEval[] {
  return (condMeta.fields ?? []).map((field) => {
    const actual = resolvePath(context, field.path);
    return { field, status: evalField(field, actual), actual };
  });
}
