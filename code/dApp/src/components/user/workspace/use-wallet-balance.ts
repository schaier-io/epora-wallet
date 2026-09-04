import { useCallback, useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import type { BrowserWallet } from "@meshsdk/core";
import { isAsset } from "@/components/user/workspace/helpers";
import { mergeAmountLists } from "@/components/user/workspace/helpers";
import type { WalletBalanceSummary } from "@/components/user/workspace/types";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceUseWalletBalance.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceUseWalletBalance", defaultMessages);

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
    error: getUserFacingErrorMessage(
      error,
      i18n("couldnTRefreshTheConnectedWalletBalanceCheck")
    )
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
  // One counter for both readers. The auto-sync effect had a `cancelled` flag and the
  // imperative refresh had nothing, so the two could not see each other: a refresh started
  // before a wallet switch still wrote the old wallet's UTxOs over the new wallet's balance
  // when it landed, and two refreshes in a row could land out of order. Every read takes a
  // number, and only the newest number is allowed to write.
  const latestReadRef = useRef(0);

  const startRead = useCallback(() => {
    latestReadRef.current += 1;
    return latestReadRef.current;
  }, []);

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

    const read = startRead();
    setWalletBalanceSummary((current) => ({
      ...current,
      loading: true,
      error: null
    }));

    void activeWallet
      .getUtxos()
      .then((utxos) => {
        if (latestReadRef.current === read) {
          setWalletBalanceSummary(summarizeUtxoAssets(utxos));
        }
      })
      .catch((error) => {
        if (latestReadRef.current === read) {
          setWalletBalanceSummary(balanceError(error));
        }
      });

    return () => {
      // Retires this read and every refresh started under the old wallet.
      latestReadRef.current += 1;
    };
  }, [activeWallet, walletReady, setWalletBalanceSummary, startRead]);

  async function refreshWalletBalance() {
    if (!activeWallet) {
      setWalletBalanceSummary({
        assets: [],
        loading: false,
        error: null
      });
      return;
    }

    const read = startRead();
    setWalletBalanceSummary((current) => ({
      ...current,
      loading: true,
      error: null
    }));

    try {
      const utxos = await activeWallet.getUtxos();
      if (latestReadRef.current === read) {
        setWalletBalanceSummary(summarizeUtxoAssets(utxos));
      }
    } catch (error) {
      if (latestReadRef.current === read) {
        setWalletBalanceSummary(balanceError(error));
      }
    }
  }

  return { refreshWalletBalance };
}
