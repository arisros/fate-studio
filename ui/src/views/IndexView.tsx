import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { MachineInfo } from "../types";

export function IndexView() {
  const [machines, setMachines] = useState<MachineInfo[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.machines().then(setMachines).catch((e) => setErr(String(e)));
  }, []);
  return (
    <div className="index">
      <p className="lede">Harel statechart viewer &amp; live simulator for the fate engine.</p>
      {err && <p className="err-box">{err}</p>}
      <div className="cards">
        {machines.map((m) => (
          <Link
            className="card"
            key={m.name}
            to={m.live ? `/sim/${encodeURIComponent(m.name)}` : `/m/${encodeURIComponent(m.name)}`}
          >
            <div className="card-name">{m.name}</div>
            <div className="card-sum">{m.summary}</div>
            <div className="card-go">{m.live ? "▶ simulate" : "view"} →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
