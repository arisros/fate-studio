import { useLayoutEffect, useRef, useState } from "react";
import type { Tip } from "../model/tooltip";

/** Where the tooltip hangs: a rect in the chart wrapper's own coordinates. */
export interface TipAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 8;

/** The one tooltip of the chart, for nodes, transition rows and edges alike. */
export function Tooltip({ tip, anchor }: { tip: Tip; anchor: TipAnchor }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.offsetParent;
    if (!el || !box) return;
    const maxLeft = box.clientWidth - el.offsetWidth - GAP;
    const below = anchor.y + anchor.h + GAP;
    const fitsBelow = below + el.offsetHeight <= box.clientHeight - GAP;
    setPos({
      left: Math.max(GAP, Math.min(anchor.x, maxLeft)),
      top: fitsBelow ? below : Math.max(GAP, anchor.y - el.offsetHeight - GAP),
    });
  }, [tip, anchor]);

  return (
    <div ref={ref} className="chart-tip" role="tooltip" style={pos ?? { left: 0, top: 0, visibility: "hidden" }}>
      <div className="chart-tip-name">{tip.name}</div>
      <dl>
        {tip.rows.map((r) => (
          <div key={r.label} className="chart-tip-row">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
