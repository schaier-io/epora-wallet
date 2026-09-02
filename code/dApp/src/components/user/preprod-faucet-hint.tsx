"use client";
import { useTranslations } from "next-intl";

import { CARDANO_NETWORK } from "@/lib/cardano-network";

// Shown where a reader hits an empty test wallet. Gated on the deployment's
// network constant (cardano-network.ts is the single source of truth). Only
// Preprod qualifies: the copy and the faucet link name Preprod specifically, so
// a preview or mainnet build must not show it.
export function PreprodFaucetHint() {
  const i18n = useTranslations("ComponentsUserPreprodFaucetHint");

  if (CARDANO_NETWORK !== "preprod") {
    return null;
  }

  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
      <p>{i18n("thisAppRunsOnPreprodCardanoSTestNetwork")}</p>
      <a
        href="https://docs.cardano.org/cardano-testnets/tools/faucet/"
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
      >
        {i18n("getFreeTestAdaFromTheCardanoPreprodFaucet")}
      </a>
    </div>
  );
}
