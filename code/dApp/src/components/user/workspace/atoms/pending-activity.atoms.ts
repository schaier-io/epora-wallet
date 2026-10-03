"use client";

import { atom, type createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import type { TransactionInfo } from "@meshsdk/common";
import type { UTxO } from "@meshsdk/core";
import { PENDING_ACTIVITY_FALLBACK_TTL_MS, PENDING_ACTIVITY_INDEXER_GRACE_MS } from "../constants";
import { buildWalletActivityEvents } from "../helpers/activity";
import { decodePendingTransaction } from "../helpers/pending-transaction";
import { walletTransactionsAtom } from "../queries/activity-query.atoms";
import { signerUtxosKeyAtom } from "../queries/signer-balance";
import { selectedDetectedTokenAtom } from "./workspace-detected-token.atoms";
import { spendableWalletUtxosAtom } from "./workspace-spendable-utxos.atoms";
import { lockingContractAtom } from "./workspace-wallet-derivations.atoms";
import { activeAddressAtom, activeWalletNameAtom } from "@/providers/wallet.atoms";
import type { WalletActivityEvent } from "../types";

type Store = ReturnType<typeof createStore>;
// `setTimeout` takes a signed 32-bit delay; a longer one fires at once.
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Transactions this tab submitted that no block holds yet. They are shown in the activity
 * feed, marked pending, and nowhere else: balances, the chart and the guided steps read
 * confirmed activity only, so a pending row never changes what the wallet holds.
 */
type PendingActivityRecord = {
  hash: string;
  walletAddress: string;
  transaction: TransactionInfo;
  submittedAt: number;
};

export const pendingActivityRecordsAtom = atom<PendingActivityRecord[]>([]);

/**
 * The UTxOs a submitted body can spend, read BEFORE signing: once the transaction is out,
 * the signer and the smart wallet stop listing the inputs it spent. The wallet set is the
 * one builds draw from, so orphan inputs picked for a recovery are included.
 */
export function capturePendingActivityInputs(store: Store): UTxO[] {
  const signerUtxos = store.get(queryClientAtom).getQueryData<UTxO[]>(store.get(signerUtxosKeyAtom)) ?? [];
  const stt = store.get(selectedDetectedTokenAtom)?.utxo;
  return [...store.get(spendableWalletUtxosAtom), ...(stt ? [stt] : []), ...signerUtxos];
}

export function recordPendingActivity(store: Store, submitted: {
  txHash: string; txHex: string; walletAddress: string | null | undefined; knownUtxos: readonly UTxO[];
}) {
  if (!submitted.walletAddress) return;
  const hash = submitted.txHash.toLowerCase();
  const decoded = decodePendingTransaction(hash, submitted.txHex, submitted.knownUtxos);
  if (!decoded) return;
  const submittedAt = Date.now();
  const record = { hash, walletAddress: submitted.walletAddress, transaction: decoded.transaction, submittedAt };
  store.set(pendingActivityRecordsAtom, records => [record, ...records.filter(entry => entry.hash !== hash)]);
  // A row whose transaction can no longer land must not stay "pending" forever.
  const expiresAt = (decoded.validUntilMs ?? submittedAt + PENDING_ACTIVITY_FALLBACK_TTL_MS) + PENDING_ACTIVITY_INDEXER_GRACE_MS;
  setTimeout(() => store.set(pendingActivityRecordsAtom, records => records.filter(entry => entry !== record)),
    Math.min(MAX_TIMER_MS, Math.max(0, expiresAt - submittedAt)));
}

/** Pending rows for the open wallet. A hash leaves the moment the indexer returns it. */
export const pendingWalletActivityEventsAtom = atom((get): WalletActivityEvent[] => {
  const walletAddress = get(lockingContractAtom).address;
  if (!walletAddress) return [];
  const records = get(pendingActivityRecordsAtom).filter(record => record.walletAddress === walletAddress);
  if (records.length === 0) return [];
  const confirmed = new Set(get(walletTransactionsAtom).items.map(transaction => transaction.hash.toLowerCase()));
  const options = {
    sttUnit: get(selectedDetectedTokenAtom)?.unit ?? null,
    activeAddress: get(activeAddressAtom),
    activeWalletName: get(activeWalletNameAtom)
  };
  return records
    .filter(record => !confirmed.has(record.hash))
    .flatMap(record => buildWalletActivityEvents(record.transaction, walletAddress, options)
      .map(event => ({ ...event, pendingSince: record.submittedAt })));
});
