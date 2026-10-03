import { atom } from "jotai";
import { atomWithQuery, queryClientAtom } from "jotai-tanstack-query";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { TransactionInfo } from "@meshsdk/common";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { txInfoQueryOptions } from "@/lib/query/chain";
import { chainGeneration } from "@/lib/query/invalidation";
import { queryKeys, queryPolicy } from "@/lib/query/keys";
import { chainReadsEnabledAtom } from "@/providers/wallet.atoms";
import { RECENT_STT_TRANSACTION_FETCH_PAGES, RECENT_WALLET_TRANSACTION_FETCH_PAGES } from "../constants";
import { mergeAndSortTransactions, normalizeTransactionIo, transactionTouchesAddress, transactionTouchesAsset, uniqueTransactionHashes } from "../helpers/transactions";
import { lockingContractAtom } from "./wallet-identity.atoms";
import { selectedDetectedTokenAtom } from "./token-identity.atoms";
import { activityAnchorTxHashesAtom } from "./activity-inputs.atoms";
import type { WalletTransactionSummary } from "../types";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceUseWalletActivity.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceUseWalletActivity", defaultMessages);
export type WalletActivityInput = { walletAddress: string; sttScriptAddress: string | null; sttUnit: string | null; anchorTxHashes?: string[] };

async function readDetails(client: QueryClient, hashes: string[]) {
  const results = await Promise.all(hashes.map(async (hash) => {
    try {
      return normalizeTransactionIo(await client.fetchQuery(txInfoQueryOptions(hash)));
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 404) return null;
      throw error;
    }
  }));
  return results.filter((result) => result !== null);
}

type WalletHistory = TransactionInfo[];

// Address history has its own cache slot so a changed anchor set (a new submit hash
// or locked UTxO) reuses fresh history and only reads the new anchor transactions.
// The slot is written, never fetched through Query: the activity query reads history
// with its own signal and retries, so there is no shared in-flight read to join.
// A read writes the slot only if its state and the chain generation are unchanged
// since the read began, so an older read cannot overwrite newer history or outlive
// an invalidation (which is a no-op on a missing or already invalidated slot).
export function walletHistoryQueryKey(input: WalletActivityInput) {
  return [...queryKeys.chain, "wallet-activity", input.walletAddress, input.sttScriptAddress, input.sttUnit, "history"] as const;
}

async function readWalletHistory(input: WalletActivityInput, client: QueryClient, signal: AbortSignal) {
  const cached = client.getQueryState<WalletHistory>(walletHistoryQueryKey(input));
  if (cached?.data && !cached.isInvalidated && Date.now() - cached.dataUpdatedAt < queryPolicy.chainStaleMs) {
    return cached.data;
  }
  const generation = chainGeneration(client);
  const fetcher = new ServerFetcher({ signal });
  const [walletItems, sttItems] = await Promise.all([
    fetcher.fetchAddressTxs(input.walletAddress, { maxPage: RECENT_WALLET_TRANSACTION_FETCH_PAGES, order: "desc" })
      .then((items) => items.map(normalizeTransactionIo).filter((transaction) => transactionTouchesAddress(transaction, input.walletAddress))),
    input.sttScriptAddress && input.sttUnit
      ? fetcher.fetchAddressTxs(input.sttScriptAddress, { maxPage: RECENT_STT_TRANSACTION_FETCH_PAGES, order: "desc" })
        .then((items) => items.map(normalizeTransactionIo).filter((transaction) => transactionTouchesAsset(transaction, input.sttUnit!)))
      : []
  ]);
  signal.throwIfAborted();
  // BlockfrostProvider.fetchAddressTxs already loads full transaction details.
  // Reuse those responses before fetching creation/submission anchors absent from history.
  const history = mergeAndSortTransactions([walletItems, sttItems]);
  for (const transaction of history) {
    client.setQueryData(queryKeys.txInfo(transaction.hash), transaction);
  }
  if (client.getQueryState(walletHistoryQueryKey(input)) === cached && chainGeneration(client) === generation) {
    client.setQueryData(walletHistoryQueryKey(input), history);
  }
  return history;
}

export function walletActivityQueryOptions(input: WalletActivityInput, client: QueryClient) {
  const anchors = uniqueTransactionHashes(input.anchorTxHashes ?? []).sort();
  return queryOptions({
    queryKey: [...queryKeys.chain, "wallet-activity", input.walletAddress, input.sttScriptAddress, input.sttUnit, anchors] as const,
    queryFn: async ({ signal }) => {
      const history = await readWalletHistory(input, client, signal);
      const directItems = await readDetails(client, anchors);
      signal.throwIfAborted();
      return mergeAndSortTransactions([history, directItems]);
    },
    staleTime: queryPolicy.chainStaleMs,
    gcTime: queryPolicy.chainGcMs
  });
}

export const walletActivityInputAtom = atom((get): WalletActivityInput => ({
  walletAddress: get(lockingContractAtom).address ?? "",
  sttScriptAddress: get(selectedDetectedTokenAtom)?.scriptAddress ?? null,
  sttUnit: get(selectedDetectedTokenAtom)?.unit ?? null,
  anchorTxHashes: get(activityAnchorTxHashesAtom)
}));
// A submit or a new locked UTxO changes only the anchors, and so the key. Keep the
// previous rows while the new entry loads instead of blanking the feed, but only for
// the same wallet: every key part except the trailing anchors must match.
function sameWalletActivity(previous: readonly unknown[], input: WalletActivityInput) {
  const wallet = walletHistoryQueryKey(input).slice(0, -1);
  return previous.length === wallet.length + 1 && wallet.every((part, index) => previous[index] === part);
}
export const walletActivityQueryAtom = atomWithQuery((get) => {
  const input = get(walletActivityInputAtom);
  return {
    ...walletActivityQueryOptions(input, get(queryClientAtom)),
    enabled: get(chainReadsEnabledAtom) && Boolean(input.walletAddress),
    placeholderData: (previous: TransactionInfo[] | undefined, previousQuery?: { queryKey: readonly unknown[] }) =>
      previousQuery && sameWalletActivity(previousQuery.queryKey, input) ? previous : undefined,
    refetchInterval: queryPolicy.activePollMs
  };
});
// Manual refreshes in flight. A counter, not a flag: the header and the activity card
// can each start one, and the first to finish must not clear the other's badge.
export const activityManualRefreshCountAtom = atom(0);
const EMPTY_ACTIVITY: WalletTransactionSummary = { items: [], loading: false, fetching: false, refreshing: false, error: null };
export const walletTransactionsAtom = atom((get): WalletTransactionSummary => {
  if (!get(chainReadsEnabledAtom) || !get(walletActivityInputAtom).walletAddress) return EMPTY_ACTIVITY;
  const result = get(walletActivityQueryAtom);
  // A submit adds its hash to the anchors, which changes the key. The previous rows stay
  // on screen as placeholder data while the new entry loads: that read is the one the
  // reader is waiting for after sending or receiving funds.
  const refreshing = !result.isPending &&
    ((result.isPlaceholderData && result.isFetching) || get(activityManualRefreshCountAtom) > 0);
  return { items: result.data ?? [], loading: result.isPending, fetching: result.isFetching, refreshing,
    error: result.error ? getUserFacingErrorMessage(result.error, i18n("couldnTLoadRecentWalletActivityRefreshAnd")) : null };
});
