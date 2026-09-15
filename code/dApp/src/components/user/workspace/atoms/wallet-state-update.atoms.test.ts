import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "jotai";

import {
  beginWalletStateUpdateAtom,
  completeWalletStateUpdateAtom,
  isSttConsumingWorkspaceAction,
  pendingWalletStateUpdateAtom, pendingWalletStateUpdatesAtom, WALLET_STATE_STORAGE_KEY
} from "./wallet-state-update.atoms";
import { consolidateSttInputHashAtom, consolidateSttInputIndexAtom } from "./forms/consolidate-form.atoms";
import { publishSttInputHashAtom, publishSttInputIndexAtom } from "./forms/publish-form.atoms";
import { sttInputOutputIndexAtom, sttInputTxHashAtom } from "./forms/stt-spend-form.atoms";
import { voteSttInputHashAtom, voteSttInputIndexAtom } from "./forms/vote-form.atoms";
import { withdrawSttInputHashAtom, withdrawSttInputIndexAtom } from "./forms/withdraw-form.atoms";

const SPENT = { txHash: "aa".repeat(32), outputIndex: 1 };
const NEXT = { txHash: "bb".repeat(32), outputIndex: 2 };
const PENDING = { walletUnit: `${"cc".repeat(28)}01`, submittedTxHash: "dd".repeat(32), spentRef: SPENT };

test("all direct STT consumers enter wallet-state refresh, but mint and funding do not", () => {
  for (const action of [
    "use", "renew-proof-of-life", "update-state", "manage-streaming-payments",
    "use-allowance", "use-beneficiary", "stop-beneficiary-stream",
    "distribute-beneficiaries", "payout-streaming-payment", "consolidate-utxo",
    "wallet-withdraw", "wallet-publish", "wallet-vote", "set-intended-stake-credential"
  ] as const) assert.equal(isSttConsumingWorkspaceAction(action), true, action);
  assert.equal(isSttConsumingWorkspaceAction("mint"), false);
  assert.equal(isSttConsumingWorkspaceAction("lock-funds"), false);
});

test("replacement compare-and-swaps all five draft refs and preserves user edits", () => {
  const store = createStore();
  const pairs = [
    [sttInputTxHashAtom, sttInputOutputIndexAtom],
    [consolidateSttInputHashAtom, consolidateSttInputIndexAtom],
    [withdrawSttInputHashAtom, withdrawSttInputIndexAtom],
    [publishSttInputHashAtom, publishSttInputIndexAtom],
    [voteSttInputHashAtom, voteSttInputIndexAtom]
  ] as const;
  for (const [hashAtom, indexAtom] of pairs) {
    store.set(hashAtom, SPENT.txHash);
    store.set(indexAtom, String(SPENT.outputIndex));
  }
  store.set(voteSttInputHashAtom, "ee".repeat(32));
  store.set(beginWalletStateUpdateAtom, PENDING);

  assert.equal(store.set(completeWalletStateUpdateAtom, { pending: PENDING, replacementRef: NEXT }), true);
  for (const [hashAtom, indexAtom] of pairs.slice(0, 4)) {
    assert.equal(store.get(hashAtom), NEXT.txHash);
    assert.equal(store.get(indexAtom), String(NEXT.outputIndex));
  }
  assert.equal(store.get(voteSttInputHashAtom), "ee".repeat(32));
  assert.equal(store.get(voteSttInputIndexAtom), String(SPENT.outputIndex));
  assert.equal(store.get(pendingWalletStateUpdateAtom), null);
});

test("an older refresh cannot complete a newer pending update", () => {
  const store = createStore();
  const newer = { ...PENDING, submittedTxHash: "ef".repeat(32) };
  store.set(beginWalletStateUpdateAtom, newer);
  assert.equal(store.set(completeWalletStateUpdateAtom, { pending: PENDING, replacementRef: NEXT }), false);
  assert.deepEqual(store.get(pendingWalletStateUpdateAtom), newer);
});

// #433: changing the screen cannot prove that a broadcast is no longer pending.
test("wallet switches and workspace resets preserve each wallet's wait", async () => {
  const { routeStateAtom } = await import("./workspace-route.atoms");
  const { resetAllFlowAtom } = await import("./transaction-flow.atoms");
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: PENDING.walletUnit });
  store.set(beginWalletStateUpdateAtom, PENDING);
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "other" });
  assert.equal(store.get(pendingWalletStateUpdateAtom), null);
  store.set(resetAllFlowAtom);
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: PENDING.walletUnit });
  assert.deepEqual(store.get(pendingWalletStateUpdateAtom), PENDING);
});

test("a fresh store restores a persisted wait before wallet actions resume", () => {
  const entries = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key)
    }
  } });
  let unsubscribe = () => {};
  try {
    const first = createStore();
    first.set(beginWalletStateUpdateAtom, PENDING);
    assert.ok(entries.get(WALLET_STATE_STORAGE_KEY)?.includes(PENDING.submittedTxHash));
    const restored = createStore();
    unsubscribe = restored.sub(pendingWalletStateUpdatesAtom, () => {});
    assert.deepEqual(restored.get(pendingWalletStateUpdateAtom), PENDING);
  } finally {
    unsubscribe();
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("the unchanged spent reference cannot complete a wait", () => {
  const store = createStore();
  store.set(beginWalletStateUpdateAtom, PENDING);
  assert.equal(store.set(completeWalletStateUpdateAtom, { pending: PENDING, replacementRef: SPENT }), false);
  assert.deepEqual(store.get(pendingWalletStateUpdateAtom), PENDING);
});

test("an inaccessible browser store cannot silently accept a durable record", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    get localStorage() { throw new Error("Browser storage blocked"); }
  } });
  try {
    assert.throws(() => createStore().set(beginWalletStateUpdateAtom, PENDING), /Browser storage blocked/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
