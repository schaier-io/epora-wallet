// @vitest-environment node
import { createStore, type PrimitiveAtom } from "jotai";
import { MeshTxBuilder, type UTxO } from "@meshsdk/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bech32Encode } from "@/lib/bech32";
import type { WalletTransactionSummary } from "../types";

vi.mock("../queries/activity-query.atoms", async () => {
  const { atom } = await import("jotai");
  return { walletTransactionsAtom: atom({ items: [], loading: false, fetching: false, refreshing: false, error: null }) };
});
vi.mock("../queries/activity-inputs.atoms", async () => ({ activityAnchorTxHashesAtom: (await import("jotai")).atom([]) }));
vi.mock("./workspace-wallet-derivations.atoms", async () => ({ lockingContractAtom: (await import("jotai")).atom({ address: "" }) }));
vi.mock("./workspace-detected-token.atoms", async () => ({ selectedDetectedTokenAtom: (await import("jotai")).atom(null) }));
vi.mock("./workspace-spendable-utxos.atoms", async () => ({ spendableWalletUtxosAtom: (await import("jotai")).atom([]) }));
vi.mock("../queries/signer-balance", async () => ({ signerUtxosKeyAtom: (await import("jotai")).atom(["signer-utxos"]) }));

import { walletTransactionsAtom } from "../queries/activity-query.atoms";
import { lockingContractAtom } from "./workspace-wallet-derivations.atoms";
import { spendableWalletUtxosAtom } from "./workspace-spendable-utxos.atoms";
import { capturePendingActivityInputs, pendingWalletActivityEventsAtom, recordPendingActivity } from "./pending-activity.atoms";
import { activityPageCountAtom, activityPageIndexAtom, displayedWalletActivityEventsAtom, paginatedWalletActivityEventsAtom, recentWalletTransactionsAtom } from "./workspace-activity.atoms";

const WALLET = bech32Encode("addr_test", Uint8Array.of(0x70, ...new Uint8Array(28).fill(0x22)));
const PAYEE = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const HASH = "ef".repeat(32);
const funds: UTxO = {
  input: { txHash: "aa".repeat(32), outputIndex: 0 },
  output: { address: WALLET, amount: [{ unit: "lovelace", quantity: "10000000" }] }
};
const sendTwoAda = (ttlSlot?: number) => {
  const builder = new MeshTxBuilder()
    .txIn(funds.input.txHash, funds.input.outputIndex, funds.output.amount, WALLET)
    .txOut(PAYEE, [{ unit: "lovelace", quantity: "2000000" }])
    .txOut(WALLET, [{ unit: "lovelace", quantity: "8000000" }]);
  if (ttlSlot !== undefined) builder.invalidHereafter(ttlSlot);
  return builder.completeSync();
};

function setup() {
  const store = createStore();
  store.set(lockingContractAtom as unknown as PrimitiveAtom<{ address: string }>, { address: WALLET });
  store.set(spendableWalletUtxosAtom as unknown as PrimitiveAtom<UTxO[]>, [funds]);
  const record = (txHex = sendTwoAda()) => recordPendingActivity(store, {
    txHash: HASH, txHex, walletAddress: WALLET, knownUtxos: capturePendingActivityInputs(store)
  });
  return { store, record };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setHistory(store: ReturnType<typeof createStore>, count: number, confirmedHash?: string) {
  const items: WalletTransactionSummary["items"] = Array.from({ length: count }, (_, index) => ({
    hash: index === 0 && confirmedHash ? confirmedHash : (count - index).toString(16).padStart(64, "0"),
    inputs: [funds], outputs: [], blockTime: count - index, slot: String(count - index),
    index: 0, block: "00".repeat(32), fees: "0", size: 0, deposit: "0", invalidBefore: "0", invalidAfter: "0"
  }));
  store.set(walletTransactionsAtom as unknown as PrimitiveAtom<WalletTransactionSummary>, {
    items, loading: false, fetching: false, refreshing: false, error: null
  });
  return items;
}

it("keeps every fetched activity and pages beyond the first thirty transactions", () => {
  const { store } = setup();
  const history = setHistory(store, 45);
  expect(store.get(recentWalletTransactionsAtom)).toEqual(history);
  expect(store.get(displayedWalletActivityEventsAtom)).toHaveLength(45);
  expect(store.get(activityPageCountAtom)).toBe(9);
  store.set(activityPageIndexAtom, 8);
  expect(store.get(paginatedWalletActivityEventsAtom).map(event => event.transaction.hash)).toEqual(history.slice(40).map(tx => tx.hash));
});

it("keeps the activity count at thirty-one when the pending transaction confirms", () => {
  const { store, record } = setup();
  setHistory(store, 30);
  record();
  expect(store.get(displayedWalletActivityEventsAtom)).toHaveLength(31);
  setHistory(store, 31, HASH);
  expect(store.get(pendingWalletActivityEventsAtom)).toHaveLength(0);
  expect(store.get(displayedWalletActivityEventsAtom)).toHaveLength(31);
  expect(store.get(activityPageCountAtom)).toBe(7);
});

it("shows a submitted transaction as a pending row with its decoded amount", () => {
  const { store, record } = setup();
  record();
  const [event] = store.get(pendingWalletActivityEventsAtom);
  expect(event).toMatchObject({ title: "Funds sent", pendingSince: Date.now() });
  expect(event!.amountSummary).toMatch(/-2/);
});

it("drops the pending row as soon as the indexer returns its hash", () => {
  const { store, record } = setup();
  record();
  store.set(walletTransactionsAtom as unknown as PrimitiveAtom<WalletTransactionSummary>, {
    items: [{ hash: HASH.toUpperCase() } as WalletTransactionSummary["items"][number]],
    loading: false, fetching: false, refreshing: false, error: null
  });
  expect(store.get(pendingWalletActivityEventsAtom)).toEqual([]);
  // The confirmed list holds only the latest pages and empties on a failed fetch.
  store.set(walletTransactionsAtom as unknown as PrimitiveAtom<WalletTransactionSummary>, {
    items: [], loading: false, fetching: false, refreshing: false, error: null
  });
  expect(store.get(pendingWalletActivityEventsAtom)).toEqual([]);
});

it("shows a pending row only on the wallet that submitted it", () => {
  const { store, record } = setup();
  record();
  store.set(lockingContractAtom as unknown as PrimitiveAtom<{ address: string }>, { address: PAYEE });
  expect(store.get(pendingWalletActivityEventsAtom)).toEqual([]);
});

// A transaction that can no longer land must not read "pending" forever. Without a validity
// end in the body, the fallback window plus indexer grace (35 minutes) applies.
it("expires a pending row that never confirmed", () => {
  const { store, record } = setup();
  record();
  vi.advanceTimersByTime(34 * 60_000);
  expect(store.get(pendingWalletActivityEventsAtom)).toHaveLength(1);
  vi.advanceTimersByTime(2 * 60_000);
  expect(store.get(pendingWalletActivityEventsAtom)).toEqual([]);
});

it("records nothing for a body it cannot decode or a submit with no open wallet", () => {
  const { store, record } = setup();
  record("not-cbor");
  recordPendingActivity(store, { txHash: HASH, txHex: sendTwoAda(), walletAddress: "", knownUtxos: [] });
  expect(store.get(pendingWalletActivityEventsAtom)).toEqual([]);
});
