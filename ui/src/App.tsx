import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MachineView } from "./views/MachineView";
import { SimView } from "./views/SimView";
import { ToastProvider } from "./toast";
import { useTheme } from "./theme";
import { api } from "./api";
import type { MachineInfo, VersionInfo } from "./types";

function Brand() {
  return (
    <>
      <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect className="brand-tile" x="2" y="2" width="60" height="60" rx="13" />
        <path d="M18 42 Q18 36 25 36 H31" fill="none" stroke="#5b7bb0" strokeWidth="4.6" />
        <circle cx="38.5" cy="36" r="6" fill="none" stroke="#5b7bb0" strokeWidth="3" />
        <circle cx="38.5" cy="36" r="2.5" fill="#5b7bb0" />
        <path d="M18 49 V25 Q18 16 27 16 H34" fill="none" stroke="#ffffff" strokeWidth="4.8" />
        <circle cx="18" cy="50" r="5" fill="#ffffff" />
        <rect x="32" y="6.5" width="19" height="19" rx="6" fill="#c2ef4e" />
        <path d="M38.6 11.2 V20.8 L46.6 16Z" fill="#0f1830" />
      </svg>
      <span className="brand-text">
        <svg className="brand-word" viewBox="-3 0 262 58" aria-hidden="true">
          <path d="M6 40 V12 Q6 4 14 4 H17 M0 16 H16 M45 28 Q45 16 35.5 16 Q26 16 26 28 Q26 40 35.5 40 Q45 40 45 28 M45 13.5 V40 M60 6 V33 Q60 40 67 40 H71 M54 16 H71 M80 28 H99 Q99 16 89.5 16 Q80 16 80 28 Q80 40 90 40 Q96 40 98.5 34.5" />
          <path
            className="brand-sub"
            transform="translate(114,0)"
            d="M17 20.5 Q14 16 9 16 Q1 16 1 22 Q1 27 9 28 Q18 29 18 34.5 Q18 40 9 40 Q3 40 0 35 M33 6 V33 Q33 40 40 40 H44 M27 16 H44 M53 13.5 V29 Q53 40 62.5 40 Q72 40 72 29 M72 13.5 V40 M100 28 Q100 16 90.5 16 Q81 16 81 28 Q81 40 90.5 40 Q100 40 100 28 M100 3 V40 M111.5 13.5 V40 M111.5 2.5 V8 M123 28 Q123 16 132.5 16 Q142 16 142 28 Q142 40 132.5 40 Q123 40 123 28Z"
          />
        </svg>
        <Versions />
      </span>
    </>
  );
}

function Versions() {
  const [v, setV] = useState<VersionInfo | null>(null);
  useEffect(() => {
    api.version().then(setV).catch(() => setV(null));
  }, []);
  if (!v) return null;
  return (
    <span className="versions" title="running versions">
      studio {v.studio}
      {v.engine ? ` · fate ${v.engine}` : ""}
    </span>
  );
}

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
          aria-label="fate studio"
        >
          <Brand />
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

// The router's basename comes from the <base> element the server rewrites, so
// client-side links carry the mount prefix without the UI hard-coding it.
function routerBasename(): string {
  const el = document.querySelector("base");
  if (!el) return "";
  try {
    return new URL(el.href).pathname.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export default function App() {
  const [machines, setMachines] = useState<MachineInfo[]>([]);

  useEffect(() => {
    api.machines().then(setMachines).catch(console.error);
  }, []);

  return (
    <BrowserRouter basename={routerBasename()}>
      <ToastProvider>
        <AppShell machines={machines} />
      </ToastProvider>
    </BrowserRouter>
  );
}
