import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "jotai";
import type { BuildResult } from "@/lib/types/contracts";
import type { UserActionKind } from "@/components/user/flow-types";
import { createDefaultStateForm, createDefaultStreamingPaymentFormState } from "@/lib/contracts/state-form";
import { activeAddressAtom, activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { configAtom } from "./atoms/workspace-config.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { selectedOrphanInputsAtom } from "./atoms/forms/orphan-inputs.atoms";
import { mintReferenceAtom, mintZeroAdminConfirmedAtom } from "./atoms/forms/mint-form.atoms";
import { voteJsonAtom, voteZeroAdminConfirmedAtom } from "./atoms/forms/vote-form.atoms";
import { publishCertificateJsonAtom, publishZeroAdminConfirmedAtom } from "./atoms/forms/publish-form.atoms";
import { withdrawAmountAtom, withdrawZeroAdminConfirmedAtom } from "./atoms/forms/withdraw-form.atoms";
import { lockFundsAssetsAtom } from "./atoms/forms/lock-funds-form.atoms";
import { beneficiaryPreparationActiveAtom, beneficiaryPreparationPoolAssetsAtom, consolidateSttInputHashAtom, consolidateWalletOutputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { DEFAULT_OPTIONAL_CONSTR_PRESET } from "./constants";
import {
  sttAuthorityPathAtom, sttStateFormAtom, sttWalletInputsAtom, sttZeroAdminConfirmedAtom,
  updateStateFormAtom, sttInputTxHashAtom, sttInputOutputIndexAtom, sttOutputAssetsAtom,
  sttWalletOutputsAtom, sttExtraTransfersAtom, beneficiaryStreamStopIdAtom, streamingPaymentPayoutAmountsAtom,
  walletOperatorPathAtom
} from "./atoms/forms/stt-spend-form.atoms";
import { sttProofOfLifeOverrideModeAtom, sttProofOfLifeSpecificDateTimeAtom } from "./atoms/forms/stt-spend-form.atoms";
import { computeActionSignature, type BuildActionSignatureCtx } from "./workspace-action-signature";
import { resolveWorkspaceTransactionInputs } from "./workspace-transaction-inputs";
import { prepareStreamingPaymentPayout } from "./workspace-payout-preparation";
import { buildRunAtom, resetFlowAtom, workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import { pendingWalletStateUpdateAtom, walletStateSubmissionsAtom } from "./atoms/wallet-state-update.atoms";
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

const inputChanges: [string, (store: Store) => void, UserActionKind?][] = [
  ["mint reference", store => store.set(mintReferenceAtom, `${TX_HASH}#1`), "mint"],
  ["lock funds assets", store => store.set(lockFundsAssetsAtom, [{ unit: "lovelace", quantity: "3000000" }]), "lock-funds"],
  ["withdraw amount", store => store.set(withdrawAmountAtom, "3000000"), "wallet-withdraw"],
  ["certificate", store => store.set(publishCertificateJsonAtom, '{"type":"Register"}'), "wallet-publish"],
  ["vote payload", store => store.set(voteJsonAtom, '{"vote":true}'), "wallet-vote"],
  ["stake authority", store => store.set(walletOperatorPathAtom, "multisig"), "set-intended-stake-credential"],
  ["consolidate State reference", store => store.set(consolidateSttInputHashAtom, TX_HASH), "consolidate-utxo"],
  ["beneficiary stream selection", store => store.set(beneficiaryStreamStopIdAtom, "1"), "stop-beneficiary-stream"],
  ["distribution fund pools", store => store.set(sttWalletInputsAtom, [{ txHash: TX_HASH, outputIndex: 0 }]), "distribute-beneficiaries"],
  ["allowance fund pools", store => store.set(sttWalletInputsAtom, [{ txHash: TX_HASH, outputIndex: 0 }]), "use-allowance"],
  ["beneficiary fund pools", store => store.set(sttWalletInputsAtom, [{ txHash: TX_HASH, outputIndex: 0 }]), "use-beneficiary"],
  ["payout amount", store => store.set(streamingPaymentPayoutAmountsAtom, { "1": "3000000" }), "payout-streaming-payment"],
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
  }, "update-state"],
  ["action", store => store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "mint" })],
  ["authority", store => store.set(sttAuthorityPathAtom, "multisig")],
  ["payment identity", store => store.set(activePaymentKeyHashAtom, "cd".repeat(28))],
  ["wallet input selection", store => store.set(sttWalletInputsAtom, [{ txHash: TX_HASH, outputIndex: 0 }])],
  ["mint confirmation", store => store.set(mintZeroAdminConfirmedAtom, true), "mint"],
  ["spend confirmation", store => store.set(sttZeroAdminConfirmedAtom, true)],
  ["vote confirmation", store => store.set(voteZeroAdminConfirmedAtom, true), "wallet-vote"],
  ["publish confirmation", store => store.set(publishZeroAdminConfirmedAtom, true), "wallet-publish"],
  ["withdraw confirmation", store => store.set(withdrawZeroAdminConfirmedAtom, true), "wallet-withdraw"]
];

for (const [name, change, action] of inputChanges) {
  test(`snapshot changes with ${name}`, () => {
    const store = createStore();
    if (action) store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: action });
    const prepared = prepare(store);
    change(store);
    assert.notEqual(store.get(workspaceTransactionSnapshotAtom), prepared.snapshot);
    assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), false);
  });
}

const selectedActions: UserActionKind[] = [
  "mint", "lock-funds", "wallet-withdraw", "wallet-publish", "wallet-vote",
  "set-intended-stake-credential", "consolidate-utxo", "use", "renew-proof-of-life",
  "update-state", "manage-streaming-payments", "use-allowance", "use-beneficiary",
  "payout-streaming-payment", "stop-beneficiary-stream", "distribute-beneficiaries"
];

for (const action of selectedActions) {
  test(`${action} keeps its prepared transaction after an unrelated form edit`, () => {
    const store = createStore();
    store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: action });
    const prepared = prepare(store);
    if (action === "wallet-vote") store.set(mintReferenceAtom, `${TX_HASH}#1`);
    else store.set(voteJsonAtom, '{"unrelated":true}');
    assert.equal(store.get(workspaceTransactionSnapshotAtom), prepared.snapshot);
    assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), true);
  });
}

for (const action of ["use", "renew-proof-of-life", "update-state", "manage-streaming-payments",
  "use-allowance", "use-beneficiary", "payout-streaming-payment"] as const) {
  test(`${action} retires a build when a shared preview-signature field changes`, () => {
    const edits: ((store: Store) => void)[] = [
      store => store.set(sttOutputAssetsAtom, [{ unit: "lovelace", quantity: "1" }]),
      store => store.set(sttWalletInputsAtom, [{ txHash: TX_HASH, outputIndex: 0 }]),
      store => store.set(sttWalletOutputsAtom, [{ amount: [], inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET } }]),
      store => store.set(sttExtraTransfersAtom, [{ address: "recipient", amount: [], inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET } }]),
      store => store.set(sttProofOfLifeOverrideModeAtom, "specific"),
      store => store.set(sttProofOfLifeSpecificDateTimeAtom, "2030-01-01T12:00"),
      store => store.set(sttZeroAdminConfirmedAtom, true)
    ];
    for (const edit of edits) {
      const store = createStore();
      store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: action });
      const signature = () => computeActionSignature(action, {
        ...resolveWorkspaceTransactionInputs(store),
        sttZeroAdminConfirmed: store.get(sttZeroAdminConfirmedAtom),
        streamingPaymentPayout: prepareStreamingPaymentPayout([])
      } as unknown as BuildActionSignatureCtx);
      const before = signature();
      const prepared = prepare(store);
      edit(store);
      assert.notEqual(signature(), before);
      assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), false);
    }
  });
}

test("lock funds ignores confirmations and the separate State update draft", () => {
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "lock-funds" });
  const before = store.get(workspaceTransactionSnapshotAtom);
  store.set(mintZeroAdminConfirmedAtom, true);
  store.set(sttZeroAdminConfirmedAtom, true);
  store.set(voteZeroAdminConfirmedAtom, true);
  store.set(publishZeroAdminConfirmedAtom, true);
  store.set(withdrawZeroAdminConfirmedAtom, true);
  store.set(updateStateFormAtom, createDefaultStateForm());
  assert.equal(store.get(workspaceTransactionSnapshotAtom), before);
});

test("beneficiary preparation tracks its pool assets and ignores ordinary consolidation outputs", () => {
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "consolidate-utxo" });
  const ordinary = store.get(workspaceTransactionSnapshotAtom);
  store.set(beneficiaryPreparationActiveAtom, true);
  const preparing = store.get(workspaceTransactionSnapshotAtom);
  assert.notEqual(preparing, ordinary);
  store.set(beneficiaryPreparationPoolAssetsAtom, [{ unit: "lovelace", quantity: "3000000" }]);
  assert.notEqual(store.get(workspaceTransactionSnapshotAtom), preparing);
  const withAssets = store.get(workspaceTransactionSnapshotAtom);
  store.set(consolidateWalletOutputsAtom, [{ amount: [], inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET } }]);
  assert.equal(store.get(workspaceTransactionSnapshotAtom), withAssets);
});

test("State update fallback changes retire the prepared update", () => {
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "update-state" });
  const before = store.get(workspaceTransactionSnapshotAtom);
  store.set(sttStateFormAtom, { ...store.get(sttStateFormAtom), walletName: "Changed fallback" });
  assert.notEqual(store.get(workspaceTransactionSnapshotAtom), before);
});

for (const [name, edit] of [
  ["output assets", (store: Store) => store.set(sttOutputAssetsAtom, [{ unit: "lovelace", quantity: "1" }])],
  ["wallet outputs", (store: Store) => store.set(sttWalletOutputsAtom, [{ amount: [], inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET } }])],
  ["extra transfers", (store: Store) => store.set(sttExtraTransfersAtom, [{ address: "", amount: [], inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET } }])]
] as const) {
  test(`proof-of-life renewal tracks validation-only ${name}`, () => {
    const store = createStore();
    store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "renew-proof-of-life" });
    const before = store.get(workspaceTransactionSnapshotAtom);
    edit(store);
    assert.notEqual(store.get(workspaceTransactionSnapshotAtom), before);
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
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet" });
  const prepared = prepare(store);
  store.set(pendingWalletStateUpdateAtom, {
    walletUnit: "wallet", submittedTxHash: TX_HASH, spentRef: { txHash: TX_HASH, outputIndex: 0 }
  });
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), false);
});

// Adding funds and creating a wallet do not spend the STT, so a pending update leaves
// their prepared transaction current. A signing still in flight holds them all.
for (const action of ["lock-funds", "mint"] as const) {
  test(`pending wallet State refresh keeps a prepared ${action} transaction`, () => {
    const store = createStore();
    store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet", selectedAction: action });
    const prepared = prepare(store);
    store.set(pendingWalletStateUpdateAtom, {
      walletUnit: "wallet", submittedTxHash: TX_HASH, spentRef: { txHash: TX_HASH, outputIndex: 0 }
    });
    assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), true);
    store.set(walletStateSubmissionsAtom, { wallet: true });
    assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT), false);
    // Its own submit set that flag. It owns no State record, and the STT update it does
    // not spend must not make its details read as stale.
    assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT, { walletUnit: "wallet", pending: null }), true);
  });
}

test("age limit and clock rollback reject prepared transactions", () => {
  const store = createStore();
  const prepared = prepare(store);
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT + PREPARED_TRANSACTION_MAX_AGE_MS), false);
  assert.equal(preparedWorkspaceTransactionIsCurrent(store, prepared, BUILT_AT - 1), false);
});
