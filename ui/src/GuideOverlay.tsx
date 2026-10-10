import { useLayoutEffect, useState } from "react";
import { GUIDE_STEPS } from "./guide";

interface StepDef {
  anchor: string;
  title: string;
  body: string;
}

const STEPS: StepDef[] = [
  {
    anchor: ".react-flow__node .node.active.leaf",
    title: "This is where the machine is",
    body: "The highlighted state is the active one. Its rows are the transitions it can take.",
  },
  {
    anchor: '[data-guide="events"]',
    title: "Send an event",
    body: "These are the events the active state accepts. Send one here, or click its row on the chart.",
  },
  {
    anchor: '[data-guide="undo"]',
    title: "Step back",
    body: "Undo takes back the last event. Reset returns to the initial state.",
  },
];

const CARD_W = 280;
const GAP = 12;
const RING_PAD = 6;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function measure(selector: string): Box | null {
  const r = document.querySelector(selector)?.getBoundingClientRect();
  if (!r || !r.width || !r.height) return null;
  return { left: r.left - RING_PAD, top: r.top - RING_PAD, width: r.width + 2 * RING_PAD, height: r.height + 2 * RING_PAD };
}

// Beside the anchor when there is room, otherwise under it, always on screen.
function cardPos(a: Box): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (t: number) => Math.max(GAP, Math.min(t, vh - 180));
  if (a.left + a.width + GAP + CARD_W <= vw - GAP) return { left: a.left + a.width + GAP, top: clampTop(a.top) };
  if (a.left - GAP - CARD_W >= GAP) return { left: a.left - GAP - CARD_W, top: clampTop(a.top) };
  return { left: Math.max(GAP, Math.min(a.left, vw - CARD_W - GAP)), top: clampTop(a.top + a.height + GAP) };
}

/**
 * The first-visit guide: one callout at a time over a layer that takes the
 * click, so advancing it never sends an event to the machine underneath.
 */
export function Guide({ step, onNext }: { step: number; onNext: () => void }) {
  const def = STEPS[step];
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    setBox(measure(def.anchor));
    // The chart paints after layout, so the anchor can arrive late or move.
    const id = window.setInterval(() => setBox(measure(def.anchor)), 250);
    const onResize = () => setBox(measure(def.anchor));
    window.addEventListener("resize", onResize);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", onResize);
    };
  }, [def.anchor]);

  if (!box) return null;
  return (
    <div className="guide" role="dialog" aria-label="studio guide" onClick={onNext}>
      <div className="guide-ring" style={box} />
      <div className="guide-card" style={{ ...cardPos(box), width: CARD_W }}>
        <div className="guide-count">
          {step + 1} / {GUIDE_STEPS}
        </div>
        <div className="guide-title">{def.title}</div>
        <p className="guide-body">{def.body}</p>
        <div className="guide-hint">{step + 1 < GUIDE_STEPS ? "click to continue" : "click to finish"} · esc to skip</div>
      </div>
    </div>
  );
}
