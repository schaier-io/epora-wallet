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

/** Session-end resets release Query payloads and local pagination state. */

const utxo = {
  input: { txHash: "aa".repeat(32), outputIndex: 0 },
  output: { address: "addr_test1example", amount: [{ unit: "lovelace", quantity: "2000000" }] }
} as UTxO;

test("resetWorkspaceDataAtom restores the fetched-data atoms to their initial values", () => {
  const store = createStore();
  const client = createAppQueryClient();
  store.set(queryClientAtom, client);
  const balanceKey = queryKeys.signerUtxos(0, "test-wallet", "test-address");
  const fundsKey = queryKeys.addressUtxos("wallet");
  const inventoryKey = queryKeys.sttInventory("policy");
  client.setQueryData(fundsKey, [utxo]);
  client.setQueryData(inventoryKey, { tokens: [{ unit: "wallet" }] });
  client.setQueryData(balanceKey, [utxo]);

  store.set(resetWorkspaceDataAtom);

  assert.deepEqual(store.get(lockedContractUtxosAtom), []);
  assert.deepEqual(store.get(walletBalanceSummaryAtom), { assets: [], loading: false, error: null });
  for (const key of [balanceKey, fundsKey, inventoryKey]) assert.equal(client.getQueryData(key), undefined);
  assert.deepEqual(store.get(detectedSttTokensAtom), []);
  assert.equal(store.get(detectedSttTokensLoadingAtom), true);
  assert.deepEqual(store.get(permissionWalletSummariesAtom), {});
  client.clear();
});

test("resetWorkspaceActivityAtom clears the fetched transactions and page index", () => {
  const store = createStore();
  const client = createAppQueryClient();
  store.set(queryClientAtom, client);
  const activityKey = [...queryKeys.chain, "wallet-activity", "wallet"];
  const transactionKey = queryKeys.txInfo("hash");
  for (const key of [activityKey, transactionKey]) client.setQueryData(key, [{ hash: "hash" }]);
  store.set(activityPageIndexAtom, 3);

  store.set(resetWorkspaceActivityAtom);

  assert.deepEqual(store.get(walletTransactionsAtom), { items: [], loading: false, error: null });
  assert.equal(store.get(activityPageIndexAtom), 0);
  for (const key of [activityKey, transactionKey]) assert.equal(client.getQueryData(key), undefined);
  client.clear();
});
