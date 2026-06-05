import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MachineView } from "./views/MachineView";
import { SimView } from "./views/SimView";
import { ToastProvider } from "./toast";
import { useTheme } from "./theme";
import { api } from "./api";
import type { MachineInfo } from "./types";

function AppShell({ machines }: { machines: MachineInfo[] }) {
  const location = useLocation();
  const [mode, toggleTheme] = useTheme();

  const pathMatch = location.pathname.match(/^\/(sim|m)\/(.+)$/);
  const activeName = pathMatch ? decodeURIComponent(pathMatch[2]) : null;

  const first = machines[0];

  return (
    <div className="app">
      <header className="topbar">
        <Link
          to={first ? (first.live ? `/sim/${encodeURIComponent(first.name)}` : `/m/${encodeURIComponent(first.name)}`) : "/"}
          className="brand"
        >
          <span className="logo">◆</span> fate <span className="brand-sub">studio</span>
        </Link>
        <div className="tab-divider" />
        <nav className="machine-tabs">
          {machines.map((m) => (
            <Link
              key={m.name}
              to={m.live ? `/sim/${encodeURIComponent(m.name)}` : `/m/${encodeURIComponent(m.name)}`}
              className={`machine-tab${activeName === m.name ? " active" : ""}`}
            >
              {m.name}
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        <button className="btn ghost icon-btn" onClick={toggleTheme} title={mode === "dark" ? "Light mode" : "Dark mode"}>
          {mode === "dark" ? "☀" : "☾"}
        </button>
      </header>
      <Routes>
        <Route
          path="/"
          element={
            first ? (
              <Navigate to={first.live ? `/sim/${encodeURIComponent(first.name)}` : `/m/${encodeURIComponent(first.name)}`} replace />
            ) : (
              <div className="empty-state">No machines registered.</div>
            )
          }
        />
        <Route path="/m/:name" element={<MachineView />} />
        <Route path="/sim/:name" element={<SimView />} />
        <Route
          path="*"
          element={
            first ? (
              <Navigate to={first.live ? `/sim/${encodeURIComponent(first.name)}` : `/m/${encodeURIComponent(first.name)}`} replace />
            ) : null
          }
        />
      </Routes>
    </div>
  );
}

export default function App() {
  const [machines, setMachines] = useState<MachineInfo[]>([]);

  useEffect(() => {
    api.machines().then(setMachines).catch(console.error);
  }, []);

  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell machines={machines} />
      </ToastProvider>
    </BrowserRouter>
  );
}
