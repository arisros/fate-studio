import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { IndexView } from "./views/IndexView";
import { MachineView } from "./views/MachineView";
import { SimView } from "./views/SimView";
import { ToastProvider } from "./toast";
import { useTheme } from "./theme";

export default function App() {
  useTheme(); // applies data-theme to <html> on load
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="app">
          <header className="topbar">
            <Link to="/" className="brand">
              <span className="logo">◆</span> fate <span className="brand-sub">studio</span>
            </Link>
          </header>
          <Routes>
            <Route path="/" element={<IndexView />} />
            <Route path="/m/:name" element={<MachineView />} />
            <Route path="/sim/:name" element={<SimView />} />
            <Route path="*" element={<IndexView />} />
          </Routes>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
