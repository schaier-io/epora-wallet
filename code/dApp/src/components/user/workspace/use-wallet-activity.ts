"use client";
import { useCallback } from "react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import type { TransactionInfo } from "@meshsdk/common";
import { activityPageIndexAtom } from "./atoms/workspace-activity.atoms";
import { mergeAndSortTransactions } from "./helpers/transactions";
import { walletActivityInputAtom, walletActivityQueryAtom, walletActivityQueryOptions, type WalletActivityInput } from "./queries/activity-query.atoms";

export function useWalletActivity() {
  const client = useAtomValue(queryClientAtom);
  const store = useStore();
  useAtomValue(walletActivityQueryAtom);
  const setActivityPageIndex = useSetAtom(activityPageIndexAtom);
  const runWalletTransactionsRefresh = useCallback(async (input: WalletActivityInput) => {
    if (!input.walletAddress) return;
    const session = store.get(workspaceSessionAtom);
    const options = walletActivityQueryOptions(input, client);
    await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
    if (store.get(workspaceSessionAtom) !== session) return;
    await client.fetchQuery(options).catch(() => undefined);
  }, [client, store]);
  const refreshWalletTransactions = useCallback(() =>
    runWalletTransactionsRefresh(store.get(walletActivityInputAtom)), [store, runWalletTransactionsRefresh]);
  const prependSubmittedTransaction = useCallback((transaction: TransactionInfo) => {
    const input = store.get(walletActivityInputAtom);
    if (!input.walletAddress) return;
    const { queryKey } = walletActivityQueryOptions(input, client);
    client.setQueryData(queryKey, (current = []) => mergeAndSortTransactions([[transaction], current]));
  }, [client, store]);
  return { setActivityPageIndex, runWalletTransactionsRefresh, refreshWalletTransactions, prependSubmittedTransaction };
}
