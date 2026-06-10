import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { Graph } from "../types";
import { LazyChart as Chart } from "../graph/render/LazyChart";
import { StudioCtx } from "../graph/studioCtx";
import { useTheme } from "../theme";
import { VirtualSimulator, type PendingDecision } from "../graph/sim/virtualSim";
import { VSimPanel } from "./VSimPanel";

export function MachineView() {
  const { name = "" } = useParams();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [err, setErr] = useState("");
  const [mode] = useTheme();
  const [vsim, setVsim] = useState<VirtualSimulator | null>(null);
  const [vsimPath, setVsimPath] = useState("");
  const [vsimDecision, setVsimDecision] = useState<PendingDecision | null>(null);

  useEffect(() => {
    setGraph(null);
    setVsim(null);
    setVsimPath("");
    setVsimDecision(null);
    api.graph(name).then(setGraph).catch((e) => setErr(String(e)));
  }, [name]);

  // Hot-reload: when the server reports this machine's snapshot changed,
  // refetch the graph so the canvas re-layouts without a full page reload.
  useEffect(() => {
    return api.onGraphChanged((changed) => {
      if (changed === name) {
        api.graph(name).then(setGraph).catch((e) => setErr(String(e)));
      }
    });
  }, [name]);

  function toggleVsim() {
    if (vsim) {
      setVsim(null);
      setVsimPath("");
      setVsimDecision(null);
      return;
    }
    if (!graph) return;
    const s = new VirtualSimulator(graph);
    setVsim(s);
    setVsimPath(s.path);
    setVsimDecision(null);
  }

  /** Sync all vsim-derived state after any mutation. */
  function syncVsim(s: VirtualSimulator) {
    setVsimPath(s.path);
    setVsimDecision(s.pendingDecision);
  }

  return (
    <div className="machine-view">
      <div className="subbar">
        <span className="mtitle">{name}</span>
        <Link to={`/sim/${encodeURIComponent(name)}`} className="btn primary">▶ simulate</Link>
        <a href={`/m/${encodeURIComponent(name)}/describe`} className="btn ghost" target="_blank" rel="noreferrer">
          JSON descriptor
        </a>
        <button className="btn ghost" onClick={toggleVsim} disabled={!graph}>
          {vsim ? "✕ close sim" : "▷ virtual sim"}
        </button>
      </div>
      <div className="canvas">
        {err && <p className="err-box">{err}</p>}
        {graph && (
          <StudioCtx.Provider value={{ interactive: false, sendable: new Set(), onSend: () => {} }}>
            <Chart machine={name} graph={graph} activePath={vsim ? vsimPath : ""} colorMode={mode} />
          </StudioCtx.Provider>
        )}
      </div>
      {vsim && graph && (
        <VSimPanel
          path={vsimPath}
          events={vsim.availableEvents()}
          pendingDecision={vsimDecision}
          onSend={(ev) => { vsim.send(ev); syncVsim(vsim); }}
          onDecide={(targetId) => { vsim.decide(targetId); syncVsim(vsim); }}
          onCancelDecision={() => { vsim.cancelDecision(); syncVsim(vsim); }}
          onUndo={() => { vsim.undo(); syncVsim(vsim); }}
          onReset={() => { vsim.reset(); syncVsim(vsim); }}
          onClose={() => { setVsim(null); setVsimPath(""); setVsimDecision(null); }}
        />
      )}
    </div>
  );
}
