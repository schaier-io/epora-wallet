"use client";
import { useTranslations } from "next-intl";


import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Returns false during SSR / first paint, true once mounted on the client —
// without a setState-in-effect cascade. Server snapshot is constant, client
// snapshot is constant, so React never re-subscribes.
const subscribeNoop = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

/**
 * Mandatory risk-acknowledgement gate.
 *
 * Acceptance is held in in-memory React state only — it is intentionally NOT
 * persisted to storage. As a result the disclaimer re-appears on every full
 * page reload, while client-side (SPA) navigation within a session keeps it
 * dismissed. The user must explicitly confirm before they can interact with
 * the app.
 */
export function RiskDisclaimerGate() {
  const i18n = useTranslations("ComponentsLayoutRiskDisclaimerGate");
  const [accepted, setAccepted] = useState(false);
  const mounted = useMounted();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (accepted || typeof document === "undefined") return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const backgroundSiblings = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlayRef.current
    );
    const priorInertValues = backgroundSiblings.map((element) =>
      element.hasAttribute("inert")
    );
    backgroundSiblings.forEach((element) => {
      element.setAttribute("inert", "");
    });

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", trapFocus);
      backgroundSiblings.forEach((element, index) => {
        if (!priorInertValues[index]) {
          element.removeAttribute("inert");
        }
      });
    };
  }, [accepted]);

  if (!mounted || accepted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="risk-disclaimer-title"
      aria-describedby="risk-disclaimer-body"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
    >
      <div
        ref={dialogRef}
        className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-amber-500/30 bg-background p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id="risk-disclaimer-title" className="text-lg font-semibold text-foreground">
            {i18n("useAtYourOwnRisk")}
          </h2>
        </div>

        <div id="risk-disclaimer-body" className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            {i18n.rich("experimentalWarning", {
              strong: (chunks) => <strong className="text-foreground">{chunks}</strong>
            })}
          </p>
          <p>
            {i18n.rich("liabilityWarning", {
              strong: (chunks) => <strong className="text-foreground">{chunks}</strong>
            })}
          </p>
          <p>
            {i18n.rich("networkWarning", {
              strong: (chunks) => <strong className="text-foreground">{chunks}</strong>
            })}
          </p>
        </div>

        <Button
          type="button"
          autoFocus
          onClick={() => setAccepted(true)}
          className="mt-1 w-full"
        >
          {i18n("iUnderstandAndAcceptTheRisks")}
        </Button>
      </div>
    </div>,
    document.body
  );
}
