"use client";

import { useCallback, useEffect, useState } from "react";
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
  refetch: () => Promise<void>;
};

// Query the wallet's PAYMENT credential directly from Koios (in the browser, on
// the user's machine — no app server) and keep only the UTxOs that are NOT at
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
  const { sttPolicyId, sttAssetNameHex, walletScriptAddress, enabled = true } =
    params;
  const [orphans, setOrphans] = useState<DiscoveredUtxo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = Boolean(
    enabled && sttPolicyId && sttAssetNameHex && walletScriptAddress
  );

  const refetch = useCallback(async () => {
    if (!canRun) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setOrphans(
        await fetchOrphans({ sttPolicyId, sttAssetNameHex, walletScriptAddress })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Discovery failed");
      setOrphans([]);
    } finally {
      setLoading(false);
    }
  }, [canRun, sttPolicyId, sttAssetNameHex, walletScriptAddress]);

  useEffect(() => {
    // Legitimate data-fetch effect (discovers orphan wallet UTxOs from chain).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!canRun) {
      setOrphans([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    void fetchOrphans({ sttPolicyId, sttAssetNameHex, walletScriptAddress })
      .then((found) => {
        if (!cancelled) {
          setOrphans(found);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Discovery failed");
          setOrphans([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canRun, sttPolicyId, sttAssetNameHex, walletScriptAddress]);

  return {
    orphans,
    orphanLovelace: sumLovelace(orphans),
    loading,
    error,
    refetch
  };
}
