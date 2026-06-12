import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import type { BrowserWallet } from "@meshsdk/core";
import { isAsset } from "@/components/user/workspace/helpers";
import { mergeAmountLists } from "@/components/user/workspace/helpers";
import type { WalletBalanceSummary } from "@/components/user/workspace/types";

export type WalletBalanceController = {
  /** Imperatively re-read the connected wallet's UTxOs (used after submits). */
  refreshWalletBalance: () => Promise<void>;
};

function summarizeUtxoAssets(
  utxos: Awaited<ReturnType<BrowserWallet["getUtxos"]>>
): WalletBalanceSummary {
  return {
    assets: mergeAmountLists(utxos.map((utxo) => utxo.output.amount.filter(isAsset))),
    loading: false,
    error: null
  };
}

function balanceError(error: unknown): WalletBalanceSummary {
  return {
    assets: [],
    loading: false,
    error: error instanceof Error ? error.message : "Unable to refresh wallet balance."
  };
}

/**
 * Owns the connected-wallet balance slice: it auto-syncs from chain UTxOs when
 * the wallet/network becomes ready and exposes an imperative refresh for the
 * post-submit path. Extracted from {@link PermissionWalletWorkspace}.
 */
export function useWalletBalance(
  activeWallet: BrowserWallet | null,
  walletReady: boolean
): WalletBalanceController {
  const setWalletBalanceSummary = useSetAtom(walletBalanceSummaryAtom);

  useEffect(() => {
    // Legitimate data-fetch effect (syncs the wallet balance from chain UTxOs).
     
    if (!walletReady) {
      setWalletBalanceSummary({
        assets: [],
        loading: false,
        error: null
      });
      return;
    }

    if (!activeWallet) {
      return;
    }

    let cancelled = false;
    setWalletBalanceSummary((current) => ({
      ...current,
      loading: true,
      error: null
    }));

    void activeWallet
      .getUtxos()
      .then((utxos) => {
        if (!cancelled) {
          setWalletBalanceSummary(summarizeUtxoAssets(utxos));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWalletBalanceSummary(balanceError(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWallet, walletReady, setWalletBalanceSummary]);

  async function refreshWalletBalance() {
    if (!activeWallet) {
      setWalletBalanceSummary({
        assets: [],
        loading: false,
        error: null
      });
      return;
    }

    setWalletBalanceSummary((current) => ({
      ...current,
      loading: true,
      error: null
    }));

    try {
      const utxos = await activeWallet.getUtxos();
      setWalletBalanceSummary(summarizeUtxoAssets(utxos));
    } catch (error) {
      setWalletBalanceSummary(balanceError(error));
    }
  }

  return { refreshWalletBalance };
}
