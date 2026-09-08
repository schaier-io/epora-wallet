import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { createAppQueryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import type { UTxO } from "@meshsdk/core";

import {
  detectedSttTokensAtom,
  detectedSttTokensLoadingAtom,
  lockedContractUtxosAtom,
  permissionWalletSummariesAtom,
  resetWorkspaceDataAtom,
  walletBalanceSummaryAtom
} from "./workspace-data.atoms";
import {
  activityPageIndexAtom,
  resetWorkspaceActivityAtom,
  walletTransactionsAtom
} from "./workspace-activity.atoms";
import type { DetectedSttToken } from "@/lib/mesh/detection";
import type { WalletTransactionSummary } from "@/components/user/workspace/types";

/**
 * The fetched-data atoms are module-global (no jotai Provider in the app), so the foundation
 * dispatches these resets when the wallet session ends (disconnect, or mounting signed out).
 * Without them, the last wallet's chain snapshot (UTxOs with datums, detected tokens,
 * transaction pages) stays resident for the tab's life.
 */

const utxo = {
  input: { txHash: "aa".repeat(32), outputIndex: 0 },
  output: { address: "addr_test1example", amount: [{ unit: "lovelace", quantity: "2000000" }] }
} as UTxO;

test("resetWorkspaceDataAtom restores the fetched-data atoms to their initial values", () => {
  const store = createStore();
  const client = createAppQueryClient();
  store.set(queryClientAtom, client);
  const balanceKey = queryKeys.signerUtxos(0, "test-wallet", "test-address");
  store.set(lockedContractUtxosAtom, [utxo]);
  client.setQueryData(balanceKey, [utxo]);
  store.set(detectedSttTokensAtom, [{ unit: "bb".repeat(32) } as DetectedSttToken]);
  store.set(detectedSttTokensLoadingAtom, false);
  store.set(permissionWalletSummariesAtom, { wallet: { locked: true } as never });

  store.set(resetWorkspaceDataAtom);

  assert.deepEqual(store.get(lockedContractUtxosAtom), []);
  assert.deepEqual(store.get(walletBalanceSummaryAtom), { assets: [], loading: false, error: null });
  assert.equal(client.getQueryData(balanceKey), undefined);
  assert.deepEqual(store.get(detectedSttTokensAtom), []);
  assert.equal(store.get(detectedSttTokensLoadingAtom), true);
  assert.deepEqual(store.get(permissionWalletSummariesAtom), {});
  client.clear();
});

test("resetWorkspaceActivityAtom clears the fetched transactions and page index", () => {
  const store = createStore();
  const filled: WalletTransactionSummary = {
    items: [{ hash: "cc".repeat(32) } as WalletTransactionSummary["items"][number]],
    loading: true,
    error: "boom"
  };
  store.set(walletTransactionsAtom, filled);
  store.set(activityPageIndexAtom, 3);

  store.set(resetWorkspaceActivityAtom);

  assert.deepEqual(store.get(walletTransactionsAtom), { items: [], loading: false, error: null });
  assert.equal(store.get(activityPageIndexAtom), 0);
});
