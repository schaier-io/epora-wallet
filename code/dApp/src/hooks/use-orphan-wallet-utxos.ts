"use client";
import { useTranslations } from "next-intl";


import { useCallback, useEffect, useRef, useState } from "react";
import { resolveWalletSpendScriptHash } from "@/lib/contracts/blueprint";
import { fetchCredentialUtxos } from "@/lib/discovery/koios-client";
import { findOrphanUtxos, sumLovelace } from "@/lib/discovery/orphan-utxos";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

type UseOrphanWalletUtxosParams = {
  sttPolicyId: string;
  sttAssetNameHex: string;
  /// The canonical wallet address (payment credential + intended stake
  /// credential) every wallet UTxO should sit at. Anything else is an orphan.
  walletScriptAddress: string;
  enabled?: boolean;
};

type UseOrphanWalletUtxosResult = {
  orphans: DiscoveredUtxo[];
  orphanLovelace: bigint;
  loading: boolean;
  error: string | null;
  /// Whether the query can run at all. When it cannot, `orphans` is empty because
  /// nothing was asked, not because nothing was found, and `refetch` returns without
  /// doing anything. A caller that treats the empty list as an all-clear reports a
  /// check that never happened.
  canCheck: boolean;
  refetch: () => Promise<void>;
};

// Query the wallet's PAYMENT credential directly from Koios (in the browser, on
// the user's machine, no app server) and keep only the UTxOs that are NOT at
// the canonical address (orphan / "Franken" UTxOs). No setState here.
async function fetchOrphans(
  params: UseOrphanWalletUtxosParams
): Promise<DiscoveredUtxo[]> {
  const paymentCredentialHex = resolveWalletSpendScriptHash({
    sttPolicyId: params.sttPolicyId,
    sttAssetNameHex: params.sttAssetNameHex
  });
  const utxos = await fetchCredentialUtxos(paymentCredentialHex);
  return findOrphanUtxos(utxos, params.walletScriptAddress);
}

/// Discover wallet UTxOs that sit at a non-intended stake credential ("Franken"
/// / orphan UTxOs). Refreshes whenever the selected wallet changes; `refetch`
/// re-checks on demand (e.g. after a consolidation).
export function useOrphanWalletUtxos(
  params: UseOrphanWalletUtxosParams
): UseOrphanWalletUtxosResult {
  const i18n = useTranslations("HooksUseOrphanWalletUtxos");
  const { sttPolicyId, sttAssetNameHex, walletScriptAddress, enabled = true } =
    params;
  const [orphans, setOrphans] = useState<DiscoveredUtxo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCheck = Boolean(
    enabled && sttPolicyId && sttAssetNameHex && walletScriptAddress
  );

  // Every fetch takes a ticket. A result whose ticket is stale belongs to an
  // earlier wallet or an earlier refetch and must not be shown.
  const requestRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!canCheck) {
      return;
    }
    const request = (requestRef.current += 1);
    const isCurrent = () => request === requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const found = await fetchOrphans({ sttPolicyId, sttAssetNameHex, walletScriptAddress });
      if (isCurrent()) setOrphans(found);
    } catch (caught) {
      if (!isCurrent()) return;
      setError(caught instanceof Error ? caught.message : i18n("discoveryFailed_32684a"));
      setOrphans([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [canCheck, sttPolicyId, sttAssetNameHex, walletScriptAddress, i18n]);

  useEffect(() => {
    // Legitimate data-fetch effect (discovers orphan wallet UTxOs from chain).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!canCheck) {
      requestRef.current += 1;
      setOrphans([]);
      setLoading(false);
      return;
    }
    void refetch();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      requestRef.current += 1;
    };
  }, [canCheck, refetch]);

  return {
    orphans,
    orphanLovelace: sumLovelace(orphans),
    loading,
    error,
    canCheck,
    refetch
  };
}
