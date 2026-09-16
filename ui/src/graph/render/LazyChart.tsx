import { lazy, Suspense } from "react";
import type { ChartProps } from "./Chart";

// Lazy boundary: the chart pulls in ELK, libavoid and @xyflow — keep them out of
// the initial bundle so the app shell (tabs/topbar) paints immediately and the
// heavy graph engine loads on demand when a machine view mounts.
const Chart = lazy(() => import("./Chart").then((m) => ({ default: m.Chart })));

export function LazyChart(props: ChartProps) {
  return (
    <Suspense fallback={<div className="empty-state">loading chart…</div>}>
      <Chart {...props} />
    </Suspense>
  );
}
