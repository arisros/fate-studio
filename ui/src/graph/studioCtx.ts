import { createContext, useContext } from "react";

// StudioCtx lets custom nodes know which events are currently sendable and how
// to send one — without threading callbacks through React Flow node data.
export interface StudioCtxValue {
  interactive: boolean; // sim mode (rows clickable) vs static view
  sendable: Set<string>; // event names dispatchable from the active leaf(s)
  onSend: (event: string) => void;
}

export const StudioCtx = createContext<StudioCtxValue>({
  interactive: false,
  sendable: new Set(),
  onSend: () => {},
});

export const useStudio = () => useContext(StudioCtx);
