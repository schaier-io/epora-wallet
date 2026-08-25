"use client";

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
  const [accepted, setAccepted] = useState(false);
  const mounted = useMounted();
  const gateRef = useRef<HTMLDivElement | null>(null);

  // Lock body scroll while the gate is up.
  useEffect(() => {
    if (accepted || typeof document === "undefined") return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [accepted]);

  // The gate had `role="alertdialog"` and `aria-modal` and nothing behind them: one Tab
  // reached the header logo, and a screen reader could walk the whole page underneath. The
  // overlay stopped the mouse and only the mouse.
  //
  // `inert` on every other child of `<body>` is the platform's own answer. It removes those
  // subtrees from the tab order AND from the accessibility tree at once, so Tab cycles
  // inside the gate without a hand-written trap to keep in sync.
  useEffect(() => {
    if (accepted || typeof document === "undefined") return;
    const gate = gateRef.current;
    if (!gate) return;

    const marked: Element[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === gate || child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      marked.push(child);
    }

    return () => {
      for (const element of marked) {
        element.removeAttribute("inert");
      }
    };
  }, [accepted, mounted]);

  if (!mounted || accepted || typeof document === "undefined") {
    return null;
  }

  // The panel is centred with `my-auto`, not with `items-center` on the scroller. Both centre
  // it, but `align-items: center` splits any overflow above and below the scroll origin, and a
  // scroller cannot reach a negative scrollTop. Measured at 500x300: the title sat at -3px with
  // the scroller already at the top, so a mandatory legal notice could not be read in full.
  // `margin: auto` collapses to 0 the moment the panel is taller than the window.
  return createPortal(
    <div
      ref={gateRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="risk-disclaimer-title"
      aria-describedby="risk-disclaimer-body"
      className="fixed inset-0 z-[200] flex justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-6"
    >
      <div className="my-auto flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-amber-500/30 bg-background p-4 shadow-2xl sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id="risk-disclaimer-title" className="text-lg font-semibold text-foreground">
            Use at your own risk
          </h2>
        </div>

        <div id="risk-disclaimer-body" className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            This wallet currently targets the{" "}
            <strong className="text-foreground">Cardano Preprod test network</strong>. Do not use it
            with real funds.
          </p>
          <p>
            This is <strong className="text-foreground">experimental, unaudited software</strong>{" "}
            provided <strong className="text-foreground">&ldquo;as is&rdquo;</strong>, with no
            warranties or guarantees of any kind.
          </p>
          <p>
            You are <strong className="text-foreground">solely responsible</strong> for any use of
            this wallet. The authors and contributors accept{" "}
            <strong className="text-foreground">no liability for any loss of funds</strong>, assets,
            or data, on testnet or mainnet, arising from its use, misuse, or malfunction.
          </p>
        </div>

        <Button
          type="button"
          autoFocus
          onClick={() => setAccepted(true)}
          className="w-full"
        >
          I understand and accept the risks
        </Button>
      </div>
    </div>,
    document.body
  );
}
