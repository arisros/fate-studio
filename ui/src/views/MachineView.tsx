import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { Graph } from "../types";
import { Chart } from "../graph/Chart";
import { StudioCtx } from "../graph/studioCtx";
import { useTheme } from "../theme";

export function MachineView() {
  const { name = "" } = useParams();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [err, setErr] = useState("");
  const [mode] = useTheme();

  useEffect(() => {
    setGraph(null);
    api.graph(name).then(setGraph).catch((e) => setErr(String(e)));
  }, [name]);

  return (
    <div className="machine-view">
      <div className="subbar">
        <Link to="/" className="back">← index</Link>
        <span className="mtitle">{name}</span>
        <Link to={`/sim/${encodeURIComponent(name)}`} className="btn primary">▶ simulate</Link>
        <a href={`/m/${encodeURIComponent(name)}/describe`} className="btn ghost" target="_blank" rel="noreferrer">
          JSON descriptor
        </a>
      </div>
      <div className="canvas">
        {err && <p className="err-box">{err}</p>}
        {graph && (
          <StudioCtx.Provider value={{ interactive: false, sendable: new Set(), onSend: () => {} }}>
            <Chart machine={name} graph={graph} activePath="" colorMode={mode} />
          </StudioCtx.Provider>
        )}
      </div>
    </div>
  );
}
