import { Check, TriangleAlert } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ToastOptions {
  /** One calm line: what just happened. */
  text: string;
  /** One way back or forward, e.g. `{ label: 'Rückgängig', onAction }`. */
  action?: { label: string; onAction: () => void } | undefined;
  /** `ok` adds a check, `danger` a warning sign; the words carry the meaning. */
  tone?: 'neutral' | 'ok' | 'danger' | undefined;
}

export type ShowToast = (options: ToastOptions) => void;

/** How long a toast stays, in milliseconds. */
export const TOAST_MS = 5000;

// Without a provider (a page rendered on its own in a test) a toast is simply not shown.
const ToastContext = createContext<ShowToast>(() => undefined);

/**
 * Returns `toast({ text, action?, tone? })`. A new toast replaces the one on screen; it leaves
 * after five seconds, and waits while the pointer or the focus is on it.
 */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

interface Shown extends ToastOptions {
  id: number;
}

/**
 * Shows the toasts of everything below it: one line above the tab bar on the phone, bottom right
 * from desktop width. Mounted once, in the shell.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [held, setHeld] = useState(false);
  const nextId = useRef(1);

  const toast = useCallback<ShowToast>((options) => {
    const id = nextId.current;
    nextId.current += 1;
    setHeld(false);
    setShown({ ...options, id });
  }, []);

  const id = shown?.id;
  useEffect(() => {
    if (id === undefined || held) {
      return;
    }
    const timer = window.setTimeout(() => {
      setShown((current) => (current?.id === id ? null : current));
    }, TOAST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [id, held]);

  const Icon = shown?.tone === 'ok' ? Check : shown?.tone === 'danger' ? TriangleAlert : null;

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* The live region is always there, so a screen reader announces what appears in it. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex justify-center lg:inset-x-auto lg:right-8 lg:bottom-8 lg:justify-end print:hidden"
      >
        {shown === null ? null : (
          <div
            key={shown.id}
            onMouseEnter={() => {
              setHeld(true);
            }}
            onMouseLeave={() => {
              setHeld(false);
            }}
            onFocus={() => {
              setHeld(true);
            }}
            onBlur={() => {
              setHeld(false);
            }}
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-onyx py-1.5 pr-1.5 pl-4 text-[0.9375rem] text-white shadow-float lg:w-auto lg:min-w-72"
          >
            {Icon === null ? null : <Icon size={20} aria-hidden="true" className="shrink-0" />}
            <p className="min-w-0 flex-1 py-2 break-words">{shown.text}</p>
            {shown.action === undefined ? (
              <span className="w-2.5" />
            ) : (
              <button
                type="button"
                onClick={() => {
                  // Leave first: the action may show a toast of its own («zurückgenommen»).
                  setShown(null);
                  shown.action?.onAction();
                }}
                className="min-h-11 shrink-0 rounded-xl bg-white/15 px-3.5 font-semibold text-white hover:bg-white/25 focus-visible:outline-white"
              >
                {shown.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
