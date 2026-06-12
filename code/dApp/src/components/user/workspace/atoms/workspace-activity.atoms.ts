"use client";

import { atom } from "jotai";
import {
  RECENT_WALLET_ACTIVITY_ANCHOR_LIMIT,
  RECENT_WALLET_TRANSACTION_VISIBLE_LIMIT,
  WALLET_ACTIVITY_PAGE_SIZE
} from "@/components/user/workspace/constants";
import {
  buildWalletActivityEvents,
  selectVisibleWalletTransactions,
  uniqueTransactionHashes
} from "@/components/user/workspace/helpers";
import { type WalletTransactionSummary } from "@/components/user/workspace/types";
import { lockedContractUtxosAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { activeAddressAtom, activeWalletNameAtom } from "@/providers/wallet.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { lockingContractAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";

/**
 * The selected wallet's recent on-chain activity. The fetched transactions + the pagination index
 * are the only state (written by useWalletActivity); the activity-event feed and pagination
 * geometry are derived atoms over them and the wallet/selection atoms — converted from the memo
 * outputs of useWalletActivity so views and the transfer/guided derivations read them directly.
 */

/** State: fetched wallet+STT transactions (written by useWalletActivity's fetch). */
export const walletTransactionsAtom = atom<WalletTransactionSummary>({
  items: [],
  loading: false,
  error: null
});
/** State: the current activity page index. */
export const activityPageIndexAtom = atom(0);

export const activityAnchorTxHashesAtom = atom((get) =>
  uniqueTransactionHashes([
    get(selectedDetectedTokenAtom)?.utxo.input.txHash,
    get(submitHashAtom),
    ...get(lockedContractUtxosAtom).map((utxo) => utxo.input.txHash)
  ]).slice(0, RECENT_WALLET_ACTIVITY_ANCHOR_LIMIT)
);

export const recentWalletTransactionsAtom = atom((get) =>
  selectVisibleWalletTransactions(
    get(walletTransactionsAtom).items,
    get(activityAnchorTxHashesAtom),
    RECENT_WALLET_TRANSACTION_VISIBLE_LIMIT
  )
);

export const recentWalletActivityEventsAtom = atom((get) => {
  const walletAddress = get(lockingContractAtom).address;
  if (!walletAddress) return [];
  const sttUnit = get(selectedDetectedTokenAtom)?.unit ?? null;
  const currentWalletUtxos = get(lockedContractUtxosAtom);
  const activeAddress = get(activeAddressAtom);
  const activeWalletName = get(activeWalletNameAtom);
  return get(recentWalletTransactionsAtom).flatMap((transaction) =>
    buildWalletActivityEvents(transaction, walletAddress, {
      sttUnit,
      currentWalletUtxos,
      activeAddress,
      activeWalletName
    })
  );
});

export const activityPageCountAtom = atom((get) =>
  Math.max(1, Math.ceil(get(recentWalletActivityEventsAtom).length / WALLET_ACTIVITY_PAGE_SIZE))
);

export const normalizedActivityPageIndexAtom = atom((get) =>
  Math.min(get(activityPageIndexAtom), get(activityPageCountAtom) - 1)
);

export const paginatedWalletActivityEventsAtom = atom((get) => {
  const events = get(recentWalletActivityEventsAtom);
  const page = get(normalizedActivityPageIndexAtom);
  return events.slice(
    page * WALLET_ACTIVITY_PAGE_SIZE,
    page * WALLET_ACTIVITY_PAGE_SIZE + WALLET_ACTIVITY_PAGE_SIZE
  );
});

export const activityVisibleStartAtom = atom((get) =>
  get(recentWalletActivityEventsAtom).length === 0
    ? 0
    : get(normalizedActivityPageIndexAtom) * WALLET_ACTIVITY_PAGE_SIZE + 1
);

export const activityVisibleEndAtom = atom((get) =>
  Math.min(
    get(recentWalletActivityEventsAtom).length,
    get(normalizedActivityPageIndexAtom) * WALLET_ACTIVITY_PAGE_SIZE +
      get(paginatedWalletActivityEventsAtom).length
  )
);

export const activityRangeLabelAtom = atom((get) => {
  if (get(walletTransactionsAtom).loading) return "Refreshing";
  const total = get(recentWalletActivityEventsAtom).length;
  if (total === 0) return "0 shown";
  return `${get(activityVisibleStartAtom)}-${get(activityVisibleEndAtom)} of ${total}`;
});
