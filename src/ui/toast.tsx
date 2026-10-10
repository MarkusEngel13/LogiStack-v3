import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A bar at the bottom for a few seconds after something was created or deleted, with Undo.
 * Quicker than a "Are you sure?" box every time, and it catches the accidents (a stray tap
 * while scrolling on the phone).
 */
export interface Toast {
  text: string;
  /** Puts things back as they were. */
  undo?: () => void;
}

const ToastContext = createContext<(t: Toast) => void>(() => {});

/** Shows a toast: `toast({ text: 'Michel deleted', undo: () => ... })`. */
export const useToast = () => useContext(ToastContext);

const SHOW_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(Toast & { key: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: Toast) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...t, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), SHOW_MS);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div
            key={toast.key}
            role="status"
            className="pointer-events-auto flex max-w-md min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-surface-3 px-4 py-2.5 text-sm text-ink shadow-2xl"
          >
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                className="min-h-9 shrink-0 rounded-md px-3 font-semibold text-accent hover:bg-surface-2"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
            <button type="button" aria-label="Close" className="shrink-0 px-1 text-muted" onClick={() => setToast(null)}>
              ×
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
