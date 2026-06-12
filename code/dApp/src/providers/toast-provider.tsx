"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastTone = "info" | "success" | "warning" | "error";

type ToastItem = {
  id: string;
  title?: string;
  description?: ReactNode;
  tone: ToastTone;
  durationMs: number;
};

type ShowToastInput = Omit<ToastItem, "id" | "tone" | "durationMs"> & {
  tone?: ToastTone;
  durationMs?: number;
};

type ToastContextType = {
  toast: (input: ShowToastInput) => string;
  success: (input: ShowToastInput) => string;
  error: (input: ShowToastInput) => string;
  warning: (input: ShowToastInput) => string;
  info: (input: ShowToastInput) => string;
  dismiss: (id: string) => void;
};

const DEFAULT_DURATION_MS = 5200;

const ToastContext = createContext<ToastContextType | null>(null);

const TONE_STYLES: Record<
  ToastTone,
  { container: string; icon: ReactNode; ring: string; label: string }
> = {
  info: {
    container: "border-sky-400/30 bg-sky-500/10 text-foreground",
    icon: <Info className="h-4 w-4 text-sky-200" aria-hidden="true" />,
    ring: "ring-sky-400/30",
    label: "Notice"
  },
  success: {
    container: "border-emerald-500/30 bg-emerald-500/10 text-foreground",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />,
    ring: "ring-emerald-500/30",
    label: "Success"
  },
  warning: {
    container: "border-amber-500/30 bg-amber-500/10 text-foreground",
    icon: <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />,
    ring: "ring-amber-500/30",
    label: "Warning"
  },
  error: {
    container: "border-rose-500/30 bg-rose-500/10 text-foreground",
    icon: <XCircle className="h-4 w-4 text-rose-300" aria-hidden="true" />,
    ring: "ring-rose-500/30",
    label: "Error"
  }
};

let toastIdCounter = 0;
const nextToastId = () => {
  toastIdCounter += 1;
  return `toast-${toastIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
};

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timersAtMount = timersRef.current;
    return () => {
      timersAtMount.forEach((timer) => clearTimeout(timer));
      timersAtMount.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ShowToastInput): string => {
      const id = nextToastId();
      const tone = input.tone ?? "info";
      const durationMs = input.durationMs ?? DEFAULT_DURATION_MS;
      const item: ToastItem = {
        id,
        title: input.title,
        description: input.description,
        tone,
        durationMs
      };
      setToasts((current) => [...current, item]);
      if (durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo<ToastContextType>(
    () => ({
      toast: push,
      success: (input) => push({ ...input, tone: "success" }),
      error: (input) => push({ ...input, tone: "error", durationMs: input.durationMs ?? 8000 }),
      warning: (input) => push({ ...input, tone: "warning" }),
      info: (input) => push({ ...input, tone: "info" }),
      dismiss
    }),
    [dismiss, push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-live="polite"
              aria-atomic="false"
              className="pointer-events-none fixed inset-x-3 bottom-3 z-[110] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end"
            >
              {toasts.map((toast) => {
                const tone = TONE_STYLES[toast.tone];
                return (
                  <div
                    key={toast.id}
                    role={toast.tone === "error" || toast.tone === "warning" ? "alert" : "status"}
                    className={cn(
                      "user-overlay pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-2xl ring-1 backdrop-blur",
                      tone.container,
                      tone.ring
                    )}
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden="true">
                      {tone.icon}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {toast.title ? (
                        <p className="text-sm font-semibold text-foreground">{toast.title}</p>
                      ) : (
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {tone.label}
                        </p>
                      )}
                      {toast.description ? (
                        <div className="break-words text-xs text-muted-foreground">
                          {toast.description}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(toast.id)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Dismiss notification"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return context;
}
