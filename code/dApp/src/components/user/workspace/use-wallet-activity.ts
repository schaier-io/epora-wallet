"use client";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { TransactionInfo } from "@meshsdk/common";
import {
  RECENT_STT_TRANSACTION_FETCH_PAGES,
  RECENT_WALLET_TRANSACTION_VISIBLE_LIMIT
} from "@/components/user/workspace/constants";
import {
  fetchAddressTransactions,
  fetchTransactionsByHash,
  mergeAndSortTransactions,
  transactionTouchesAddress,
  transactionTouchesAsset,
  uniqueTransactionHashes
} from "@/components/user/workspace/helpers";
import {
  activityAnchorTxHashesAtom,
  activityPageIndexAtom,
  walletTransactionsAtom
} from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { lockingContractAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";

/**
 * Recent on-chain activity for the selected smart wallet: fetches the wallet's (and its STT
 * thread's) transactions and writes them to {@link walletTransactionsAtom}. The activity-event
 * feed + pagination geometry are derived atoms (workspace-activity.atoms.ts) that views and the
 * transfer/guided derivations read directly; this hook is the single fetch writer and exposes the
 * refresh / pagination actions. Inputs (wallet address, selected token, anchors) are read from atoms.
 */
export function useWalletActivity() {
  const walletAddress = useAtomValue(lockingContractAtom).address;
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const activityAnchorTxHashes = useAtomValue(activityAnchorTxHashesAtom);
  const setWalletTransactions = useSetAtom(walletTransactionsAtom);
  const setActivityPageIndex = useSetAtom(activityPageIndexAtom);
  const walletTransactionsRequestIdRef = useRef(0);

  const runWalletTransactionsRefresh = useCallback(
    async ({
      walletAddress: targetWalletAddress,
      sttScriptAddress,
      sttUnit,
      anchorTxHashes
    }: {
      walletAddress: string;
      sttScriptAddress: string | null;
      sttUnit: string | null;
      anchorTxHashes?: string[];
    }) => {
      const requestId = walletTransactionsRequestIdRef.current + 1;
      walletTransactionsRequestIdRef.current = requestId;

      setWalletTransactions((current) => ({
        ...current,
        loading: true,
        error: null
      }));

      try {
        const directTxHashes = uniqueTransactionHashes(anchorTxHashes ?? []);
        const [walletItems, sttItems, directItems] = await Promise.all([
          fetchAddressTransactions(targetWalletAddress).then((items) =>
            items.filter((transaction) => transactionTouchesAddress(transaction, targetWalletAddress))
          ),
          sttScriptAddress && sttUnit
            ? fetchAddressTransactions(sttScriptAddress, RECENT_STT_TRANSACTION_FETCH_PAGES).then(
                (items) => items.filter((transaction) => transactionTouchesAsset(transaction, sttUnit))
              )
            : Promise.resolve([] as TransactionInfo[]),
          fetchTransactionsByHash(directTxHashes)
        ]);
        const rawItems = mergeAndSortTransactions([walletItems, sttItems, directItems]);
        const detailedItems = await fetchTransactionsByHash(
          uniqueTransactionHashes(
            rawItems
              .slice(0, RECENT_WALLET_TRANSACTION_VISIBLE_LIMIT)
              .map((transaction) => transaction.hash)
          )
        );
        const items = mergeAndSortTransactions([rawItems, detailedItems]);

        if (walletTransactionsRequestIdRef.current !== requestId) {
          return;
        }

        setWalletTransactions({ items, loading: false, error: null });
      } catch (error) {
        if (walletTransactionsRequestIdRef.current !== requestId) {
          return;
        }

        setWalletTransactions({
          items: [],
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load recent transactions."
        });
      }
    },
    [setWalletTransactions]
  );

  useEffect(() => {
    if (!walletAddress) {
      walletTransactionsRequestIdRef.current += 1;
      setWalletTransactions({ items: [], loading: false, error: null });
      return;
    }

    void runWalletTransactionsRefresh({
      walletAddress,
      sttScriptAddress: selectedDetectedToken?.scriptAddress ?? null,
      sttUnit: selectedDetectedToken?.unit ?? null,
      anchorTxHashes: activityAnchorTxHashes
    });
  }, [
    activityAnchorTxHashes,
    walletAddress,
    runWalletTransactionsRefresh,
    selectedDetectedToken,
    setWalletTransactions
  ]);

  // Optimistically prepend a just-submitted transaction so it shows in the feed
  // before the next chain refresh resolves it.
  const prependSubmittedTransaction = useCallback(
    (transaction: TransactionInfo) => {
      setWalletTransactions((current) => ({
        ...current,
        items: mergeAndSortTransactions([[transaction], current.items]),
        error: null
      }));
    },
    [setWalletTransactions]
  );

  const refreshWalletTransactions = useCallback(async () => {
    if (!walletAddress) {
      walletTransactionsRequestIdRef.current += 1;
      setWalletTransactions({ items: [], loading: false, error: null });
      return;
    }

    await runWalletTransactionsRefresh({
      walletAddress,
      sttScriptAddress: selectedDetectedToken?.scriptAddress ?? null,
      sttUnit: selectedDetectedToken?.unit ?? null,
      anchorTxHashes: activityAnchorTxHashes
    });
  }, [
    walletAddress,
    selectedDetectedToken,
    activityAnchorTxHashes,
    runWalletTransactionsRefresh,
    setWalletTransactions
  ]);

  return {
    setActivityPageIndex,
    runWalletTransactionsRefresh,
    refreshWalletTransactions,
    prependSubmittedTransaction
  };
}
