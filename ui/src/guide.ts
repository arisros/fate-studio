import { useCallback, useEffect, useState } from "react";

// First-visit guide state. Remembered in localStorage the way theme.ts keeps
// the color mode, except that a blocked store only means the guide shows again.

export const GUIDE_KEY = "fate-guide";
export const GUIDE_STEPS = 3;

type Store = Pick<Storage, "getItem" | "setItem">;

export function guideSeen(store: Store | undefined): boolean {
  try {
    return store?.getItem(GUIDE_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markGuideSeen(store: Store | undefined): void {
  try {
    store?.setItem(GUIDE_KEY, "seen");
  } catch {
    /* private mode or quota */
  }
}

/** The step after `step`, or null once the last one is done. */
export function nextStep(step: number, total = GUIDE_STEPS): number | null {
  return step + 1 < total ? step + 1 : null;
}

const store = () => (typeof localStorage === "undefined" ? undefined : localStorage);

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * Drives the guide: it opens once `eligible` first holds on a first visit,
 * Esc closes it, and "?" replays it. While not eligible it stays shut.
 */
export function useGuide(eligible: boolean): { step: number | null; next: () => void; close: () => void } {
  const [step, setStep] = useState<number | null>(null);

  const close = useCallback(() => {
    markGuideSeen(store());
    setStep(null);
  }, []);
  const next = useCallback(() => {
    setStep((s) => {
      const n = s == null ? null : nextStep(s);
      if (n == null) markGuideSeen(store());
      return n;
    });
  }, []);

  useEffect(() => {
    if (!eligible) return setStep(null);
    if (!guideSeen(store())) setStep(0);
  }, [eligible]);

  useEffect(() => {
    if (!eligible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "?" && !typing(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) setStep(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eligible, close]);

  return { step, next, close };
}
