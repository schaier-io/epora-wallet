"use client";

import { useState } from "react";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { LEGAL_VERSION } from "@/lib/legal";
import { BETA_ACKNOWLEDGEMENTS, hasCurrentBetaReceipt, type BetaAcknowledgements } from "@/lib/legal/beta-consent";

export function useBetaConsent(initialAccepted: boolean) {
  const [accepted, setAccepted] = useState(initialAccepted);
  const [acknowledgements, setAcknowledgements] = useState<BetaAcknowledgements>({ beta: false, unaudited: false, totalLoss: false, liabilityRelease: false, terms: false });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const ready = BETA_ACKNOWLEDGEMENTS.every((key) => acknowledgements[key]);

  async function accept() {
    if (!ready || pending) return;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/beta-consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...acknowledgements, network: CARDANO_NETWORK, version: LEGAL_VERSION })
      });
      if (!response.ok) throw new Error("Acceptance rejected");
      // A successful Set-Cookie response does not prove that the browser kept it.
      const check = await fetch("/api/beta-consent", { credentials: "same-origin", cache: "no-store" });
      const receipt: unknown = await check.json();
      if (!check.ok || !hasCurrentBetaReceipt(receipt)) throw new Error("Acceptance not retained");
      setAccepted(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return { accepted, acknowledgements, setAcknowledgements, pending, failed, ready, accept };
}
