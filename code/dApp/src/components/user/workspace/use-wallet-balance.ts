import { useEffect, useRef, type MutableRefObject } from "react";
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

type SetWalletBalanceSummary = (
  update: WalletBalanceSummary | ((current: WalletBalanceSummary) => WalletBalanceSummary)
) => void;

/**
 * Read the connected wallet's UTxOs and publish the result, unless a newer read
 * started meanwhile.
 *
 * The mount effect and every post-submit refresh call the same provider, and the
 * post-submit poll fires four times over ~75s, so two reads are regularly in
 * flight together. Without the token the slower answer wins whenever it lands
 * last, which shows an older balance than one already on screen. Bumping the
 * counter also supersedes a read whose wallet has since been replaced.
 */
async function readWalletBalance(
  wallet: BrowserWallet,
  newestRequestRef: MutableRefObject<number>,
  setWalletBalanceSummary: SetWalletBalanceSummary
) {
  const token = ++newestRequestRef.current;
  setWalletBalanceSummary((current) => ({
    ...current,
    loading: true,
    error: null
  }));

  try {
    const utxos = await wallet.getUtxos();
    if (token === newestRequestRef.current) {
      setWalletBalanceSummary(summarizeUtxoAssets(utxos));
    }
  } catch (error) {
    if (token === newestRequestRef.current) {
      setWalletBalanceSummary(balanceError(error));
    }
  }
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
  const newestRequestRef = useRef(0);

  useEffect(() => {
    // Legitimate data-fetch effect (syncs the wallet balance from chain UTxOs).
     
    if (!walletReady) {
      newestRequestRef.current += 1;
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

    void readWalletBalance(activeWallet, newestRequestRef, setWalletBalanceSummary);

    // Superseding the request replaces the cancelled flag this used to carry,
    // and covers a read the imperative refresh started against the old wallet.
    return () => {
      newestRequestRef.current += 1;
    };
  }, [activeWallet, walletReady, setWalletBalanceSummary]);

  async function refreshWalletBalance() {
    if (!activeWallet) {
      newestRequestRef.current += 1;
      setWalletBalanceSummary({
        assets: [],
        loading: false,
        error: null
      });
      return;
    }

    await readWalletBalance(activeWallet, newestRequestRef, setWalletBalanceSummary);
  }

  return { refreshWalletBalance };
}
