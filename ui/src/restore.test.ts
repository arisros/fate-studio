import { describe, expect, it } from "vitest";
import { replayMessage, shouldReplay } from "./restore";
import type { SimFrame, SimStep } from "./types";

const step: SimStep = { kind: "event", label: "NEXT", from: "red", to: "green" };
const frame = (session: string, steps: SimStep[] = []) => ({ session, steps }) as SimFrame;

describe("shouldReplay", () => {
  it("replays remembered steps into a session that replaced theirs", () => {
    expect(shouldReplay({ session: "a", steps: [step] }, frame("b"))).toBe(true);
  });
  it("leaves the same session alone", () => {
    expect(shouldReplay({ session: "a", steps: [step] }, frame("a", [step]))).toBe(false);
    expect(shouldReplay({ session: "a", steps: [step] }, frame("a"))).toBe(false);
  });
  it("has nothing to replay without remembered steps", () => {
    expect(shouldReplay(null, frame("b"))).toBe(false);
    expect(shouldReplay({ session: "a", steps: [] }, frame("b"))).toBe(false);
  });
  it("does not overwrite a new session that already has steps", () => {
    expect(shouldReplay({ session: "a", steps: [step] }, frame("b", [step]))).toBe(false);
  });
  it("ignores a proxied frame, which carries no session id", () => {
    expect(shouldReplay({ session: "a", steps: [step] }, {} as SimFrame)).toBe(false);
  });
});

describe("replayMessage", () => {
  it("reports a complete replay", () => {
    expect(replayMessage(1, 1)).toBe("Machine reloaded. Replayed 1 step.");
    expect(replayMessage(3, 3)).toBe("Machine reloaded. Replayed 3 steps.");
  });
  it("says where a partial replay stopped", () => {
    expect(replayMessage(1, 3, 'step 2 (event GONE): unknown event "GONE"')).toBe(
      'Machine reloaded. Replayed 1 of 3 steps: step 2 (event GONE): unknown event "GONE"',
    );
  });
});
