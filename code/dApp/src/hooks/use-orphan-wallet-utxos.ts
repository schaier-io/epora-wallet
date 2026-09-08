"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { resolveWalletSpendScriptHash } from "@/lib/contracts/blueprint";
import { fetchCredentialUtxos } from "@/lib/discovery/koios-client";
import { findOrphanUtxos, sumLovelace } from "@/lib/discovery/orphan-utxos";
import { CHAIN_NETWORK, queryKeys, queryPolicy } from "@/lib/query/keys";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

type UseOrphanWalletUtxosParams = {
  sttPolicyId: string;
  sttAssetNameHex: string;
  walletScriptAddress: string;
  enabled?: boolean;
};

type UseOrphanWalletUtxosResult = {
  orphans: DiscoveredUtxo[];
  orphanLovelace: bigint;
  loading: boolean;
  error: string | null;
  /** An empty disabled query does not prove that the wallet has no orphans. */
  canCheck: boolean;
  refetch: () => Promise<void>;
};

export function useOrphanWalletUtxos({ sttPolicyId, sttAssetNameHex, walletScriptAddress, enabled = true }:
  UseOrphanWalletUtxosParams): UseOrphanWalletUtxosResult {
  const i18n = useTranslations("HooksUseOrphanWalletUtxos");
  const canCheck = Boolean(enabled && sttPolicyId && sttAssetNameHex && walletScriptAddress);
  const query = useQuery({
    queryKey: [...queryKeys.chain, "orphan-utxos", sttPolicyId, sttAssetNameHex, walletScriptAddress],
    enabled: canCheck,
    refetchInterval: queryPolicy.activePollMs,
    queryFn: async ({ signal }) => {
      const credential = resolveWalletSpendScriptHash({ sttPolicyId, sttAssetNameHex });
      const utxos = await fetchCredentialUtxos(credential, CHAIN_NETWORK, signal);
      signal.throwIfAborted();
      return findOrphanUtxos(utxos, walletScriptAddress);
    }
  });
  const orphans = canCheck ? query.data ?? [] : [];
  return {
    orphans,
    orphanLovelace: sumLovelace(orphans),
    loading: canCheck && (query.isPending || query.isFetching),
    error: canCheck && query.error ? (query.error instanceof Error ? query.error.message : i18n("discoveryFailed_32684a")) : null,
    canCheck,
    refetch: async () => { if (canCheck) await query.refetch(); }
  };
}
