"use client";

import { useEffect } from "react";
import type { ContractConfig } from "@/lib/types/contracts";
import type { UTxO } from "@meshsdk/common";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { readImmutableInputMetadata } from "@/lib/mesh/transactions/internals/immutable-input-cache";
import { parseReferenceUtxoConfig } from "@/lib/mesh/transactions/internals/reference-utxo-config";

type PreparationOptions = {
  enabled: boolean;
  selectedWalletUnit: string;
  config: ContractConfig;
  sttInput?: UTxO["input"];
  session?: object;
};

/** Warm output content only. The build still checks each input's current spend status. */
export function useWorkspaceBuildPreparation({ enabled, selectedWalletUnit, config, sttInput, session }: PreparationOptions) {
  // At most five configured references and one selected State input. Stable primitives
  // prevent unrelated renders from cancelling useful reads.
  const references = JSON.stringify([
    config.sttSpendReference, config.walletSpendReference, config.walletWithdrawReference,
    config.walletPublishReference, config.walletVoteReference,
    sttInput ? `${sttInput.txHash}#${sttInput.outputIndex}` : undefined
  ]);
  useEffect(() => {
    if (!enabled || !selectedWalletUnit) return;
    const controller = new AbortController();
    const fetcher = new ServerFetcher({ signal: controller.signal });
    const seen = new Set<string>();
    for (const value of JSON.parse(references) as Array<string | null>) {
      let input;
      try { input = parseReferenceUtxoConfig(value ?? undefined, "Reference input"); }
      catch { continue; }
      if (!input || !Number.isSafeInteger(input.outputIndex) || input.outputIndex < 0) continue;
      const key = `${input.txHash}#${input.outputIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Warmup failure must not prevent the ordinary build from retrying.
      void readImmutableInputMetadata(fetcher, input.txHash, input.outputIndex).catch(() => undefined);
    }
    return () => controller.abort();
  }, [enabled, selectedWalletUnit, references, session]);
}
