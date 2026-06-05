import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Kind = "ok" | "err" | "info";
interface Toast {
  id: number;
  kind: Kind;
  msg: string;
}

const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Kind = "info") => {
    const id = seq++;
    setToasts((t) => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
