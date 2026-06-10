// libavoid routing parameters. shapeBufferDistance is the minimum clearance the
// router keeps between any edge segment and any node — this is what guarantees
// the ≥20px gap requirement (and that no edge is drawn through a node).
export const SHAPE_BUFFER = 28; // minimum clearance between any route segment and any node
export const IDEAL_NUDGE = 20; // spacing between parallel segments running near each other
export const SEGMENT_PENALTY = 50; // strongly discourage extra bends (prefer straight long runs)
// Libavoid anchor sits further out than the handle dot so the anchor is outside the
// shape's buffer zone — this makes libavoid's first/last segment naturally horizontal.
// Must be > SHAPE_BUFFER. The gap between ROUTER_PAD and HANDLE_GAP becomes a short
// horizontal stub prepended/appended to the route so the path always exits the dot horizontally.
export const ROUTER_PAD = 34;

// Where the WASM lives (served by the Go embed server, and by Vite in dev).
export const WASM_URL = "/assets/libavoid.wasm";
