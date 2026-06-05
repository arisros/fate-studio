import { useCallback, useEffect, useState } from "react";

export type Mode = "light" | "dark";

export function useTheme(): [Mode, () => void] {
  const [mode, setMode] = useState<Mode>(() => {
    return (localStorage.getItem("fate-theme") as Mode) || "dark";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem("fate-theme", mode);
  }, [mode]);
  const toggle = useCallback(() => setMode((m) => (m === "dark" ? "light" : "dark")), []);
  return [mode, toggle];
}
