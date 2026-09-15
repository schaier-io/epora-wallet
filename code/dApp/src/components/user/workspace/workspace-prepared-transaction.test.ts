import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "jotai";
import type { BuildResult } from "@/lib/types/contracts";
import { createDefaultStateForm, createDefaultStreamingPaymentFormState } from "@/lib/contracts/state-form";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { configAtom } from "./atoms/workspace-config.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { selectedOrphanInputsAtom } from "./atoms/forms/orphan-inputs.atoms";
import { mintZeroAdminConfirmedAtom } from "./atoms/forms/mint-form.atoms";
import { voteZeroAdminConfirmedAtom } from "./atoms/forms/vote-form.atoms";
import { publishZeroAdminConfirmedAtom } from "./atoms/forms/publish-form.atoms";
import { withdrawZeroAdminConfirmedAtom } from "./atoms/forms/withdraw-form.atoms";
import {
  sttAuthorityPathAtom, sttStateFormAtom, sttWalletInputsAtom, sttZeroAdminConfirmedAtom,
  updateStateFormAtom, sttInputTxHashAtom, sttInputOutputIndexAtom
} from "./atoms/forms/stt-spend-form.atoms";
import { buildRunAtom, resetFlowAtom, workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import { pendingWalletStateUpdateAtom } from "./atoms/wallet-state-update.atoms";
import {
  PREPARED_TRANSACTION_MAX_AGE_MS, type PreparedWorkspaceTransaction,
  preparedWorkspaceTransactionIsCurrent, workspaceTransactionSnapshotAtom
} from "./workspace-prepared-transaction";

type Store = ReturnType<typeof createStore>;
const BUILT_AT = 100_000;
const DAY_MS = 86_400_000;
const TX_HASH = "ab".repeat(32);

function prepare(store: Store): PreparedWorkspaceTransaction {
  return {
    result: { txHex: "unsigned" } as BuildResult,
    snapshot: store.get(workspaceTransactionSnapshotAtom),
    session: store.get(workspaceSessionAtom),
    builtAt: BUILT_AT,
    buildRun: store.get(buildRunAtom),
    proposalCapture: null
  };
}

const inputChanges: [string, (store: Store) => void][] = [
  ["mint reference config", store => store.set(configAtom, {
    ...store.get(configAtom), sttSpendReference: `${TX_HASH}#0`
  })],
  ["lock funds stake credential", store => {
    store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "lock-funds" });
    const before = store.get(workspaceTransactionSnapshotAtom);
    store.set(sttStateFormAtom, {
      ...store.get(sttStateFormAtom),
      intendedStakeCredential: { alternative: 0, fields: [{ alternative: 0, fields: ["cd".repeat(28)] }] }
    });
    assert.notEqual(store.get(workspaceTransactionSnapshotAtom), before);
  }],
  ["separate State update form", store => {
    const form = createDefaultStateForm();
    form.intendedStakeCredential = { alternative: 0, fields: [{ alternative: 0, fields: ["cd".repeat(28)] }] };
    store.set(updateStateFormAtom, form);
  }],
  ["action", store => store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "mint" })],
  ["authority", store => store.set(sttAuthorityPathAtom, "multisig")],
  ["payment identity", store => store.set(activePaymentKeyHashAtom, "cd".repeat(28))],
  ["wallet input selection", store => store.set(sttWalletInputsAtom, [{ txHash: TX_HASH, outputIndex: 0 }])],
  ["mint confirmation", store => store.set(mintZeroAdminConfirmedAtom, true)],
  ["spend confirmation", store => store.set(sttZeroAdminConfirmedAtom, true)],
  ["vote confirmation", store => store.set(voteZeroAdminConfirmedAtom, true)],
  ["publish confirmation", store => store.set(publishZeroAdminConfirmedAtom, true)],
  ["withdraw confirmation", store => store.set(withdrawZeroAdminConfirmedAtom, true)]
];

for (const [name, change] of inputChanges) {
  test(`snapshot changes with ${name}`, () => {
    const store = createStore();
    const prepared = prepare(store);
    change(store);
    assert.notEqual(store.get(workspaceTransactionSnapshotAtom), prepared.snapshot);
    assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), false);
  });
}

test("snapshot includes recovered wallet input contents", () => {
  const store = createStore();
  const walletUnit = `${"cd".repeat(28)}01`;
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "use-beneficiary", selectedWalletUnit: walletUnit });
  const before = store.get(workspaceTransactionSnapshotAtom);
  store.set(selectedOrphanInputsAtom, {
    walletUnit, signerAddress: null,
    outputs: [{ txHash: TX_HASH, outputIndex: 0, address: "addr_test1recovery", lovelace: "2000000", assets: [] }]
  });
  assert.notEqual(store.get(workspaceTransactionSnapshotAtom), before);
  const withInputs = store.get(workspaceTransactionSnapshotAtom);
  store.set(selectedOrphanInputsAtom, {
    walletUnit, signerAddress: null,
    outputs: [{ txHash: TX_HASH, outputIndex: 0, address: "addr_test1recovery", lovelace: "3000000", assets: [] }]
  });
  assert.notEqual(store.get(workspaceTransactionSnapshotAtom), withInputs);
});

test("equivalent input writes preserve snapshot identity", () => {
  const store = createStore();
  const before = store.get(workspaceTransactionSnapshotAtom);
  store.set(configAtom, { ...store.get(configAtom) });
  store.set(sttStateFormAtom, structuredClone(store.get(sttStateFormAtom)));
  store.set(sttWalletInputsAtom, []);
  assert.equal(store.get(workspaceTransactionSnapshotAtom), before);
});

test("ordinary actions ignore the render clock", () => {
  const store = createStore();
  const before = store.get(workspaceTransactionSnapshotAtom);
  store.set(renderNowMsAtom, DAY_MS);
  assert.equal(store.get(workspaceTransactionSnapshotAtom), before);
});

test("implicit streaming payout amounts change the snapshot as time advances", () => {
  const store = createStore();
  const state = createDefaultStateForm();
  state.streamingPayments = [{
    ...createDefaultStreamingPaymentFormState("1"),
    payoutAddress: "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6",
    amountPerDay: "1000000", startDate: "0", endDate: String(10 * DAY_MS)
  }];
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "payout-streaming-payment" });
  store.set(sttStateFormAtom, state);
  store.set(sttInputTxHashAtom, TX_HASH);
  store.set(sttInputOutputIndexAtom, "0");
  store.set(renderNowMsAtom, DAY_MS);
  const before = store.get(workspaceTransactionSnapshotAtom);
  store.set(renderNowMsAtom, 2 * DAY_MS);
  assert.notEqual(store.get(workspaceTransactionSnapshotAtom), before);
});

test("current prepared transaction remains usable within its age limit", () => {
  const store = createStore();
  const prepared = prepare(store);
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), true);
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT + PREPARED_TRANSACTION_MAX_AGE_MS - 1), true);
});

test("flow reset retires the prepared build even when form inputs are unchanged", () => {
  const store = createStore();
  const prepared = prepare(store);
  store.set(resetFlowAtom);
  assert.equal(store.get(workspaceTransactionSnapshotAtom), prepared.snapshot);
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), false);
});

test("wallet session changes reject a prepared transaction", () => {
  const store = createStore();
  const prepared = prepare(store);
  store.set(activeAddressAtom, "addr_test1changed");
  assert.notEqual(store.get(workspaceSessionAtom), prepared.session);
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), false);
});

test("pending wallet State refresh blocks the prepared transaction", () => {
  const store = createStore();
  const prepared = prepare(store);
  store.set(pendingWalletStateUpdateAtom, {
    walletUnit: "wallet", submittedTxHash: TX_HASH, spentRef: { txHash: TX_HASH, outputIndex: 0 }
  });
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), false);
});

test("age limit and clock rollback reject prepared transactions", () => {
  const store = createStore();
  const prepared = prepare(store);
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT + PREPARED_TRANSACTION_MAX_AGE_MS), false);
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT - 1), false);
});
