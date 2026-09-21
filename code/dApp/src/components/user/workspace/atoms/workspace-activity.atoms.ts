"use client";

import { atom } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { queryKeys } from "@/lib/query/keys";
import { activityAnchorTxHashesAtom } from "../queries/activity-inputs.atoms";
import { walletTransactionsAtom } from "../queries/activity-query.atoms";
export { activityAnchorTxHashesAtom } from "../queries/activity-inputs.atoms";
export { walletTransactionsAtom } from "../queries/activity-query.atoms";
import {
  RECENT_WALLET_TRANSACTION_VISIBLE_LIMIT,
  WALLET_ACTIVITY_PAGE_SIZE
} from "@/components/user/workspace/constants";
import {
  buildWalletActivityEvents,
  selectVisibleWalletTransactions
} from "@/components/user/workspace/helpers";
import { lockedContractUtxosAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { activeAddressAtom, activeWalletNameAtom } from "@/providers/wallet.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { lockingContractAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceAtomsWorkspaceActivityAtoms.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceAtomsWorkspaceActivityAtoms", defaultMessages);

/**
 * The selected wallet's recent on-chain activity. The fetched transactions + the pagination index
 * are the only state (written by useWalletActivity); the activity-event feed and pagination
 * geometry are derived atoms over them and the wallet/selection atoms, converted from the memo
 * outputs of useWalletActivity so views and the transfer/guided derivations read them directly.
 */

/** State: the current activity page index. */
export const activityPageIndexAtom = atom(0);

/** Release full transaction payloads when the wallet session ends. */
export const resetWorkspaceActivityAtom = atom(null, (get, set) => {
  const client = get(queryClientAtom);
  client.removeQueries({ queryKey: [...queryKeys.chain, "wallet-activity"] });
  client.removeQueries({ queryKey: [...queryKeys.chain, "transaction"] });
  set(activityPageIndexAtom, 0);
});

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

/**
 * Loading and empty only. This used to fall through to "1 to 5 of 19", which the paging row
 * under the list states as "Showing 1-5 of 19" beside the Previous/Next buttons it belongs
 * to: two spellings of one range, a card apart. `null` means the header shows no badge.
 *
 * Below `WALLET_ACTIVITY_PAGE_SIZE` there is no paging row either, and no range is stated
 * anywhere. That is deliberate: every row is on screen, so the reader can see how many
 * there are without being told.
 */
export const activityRangeLabelAtom = atom((get) => {
  if (get(walletTransactionsAtom).loading) return i18n("refreshing");
  if (get(recentWalletActivityEventsAtom).length === 0) return i18n("noneShown");
  return null;
});
