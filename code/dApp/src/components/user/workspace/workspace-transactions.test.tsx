import { beneficiaryPreparationActiveAtom, beneficiaryPreparationPoolAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { createStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import { lockFundsAssetsAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { configAtom } from "./atoms/workspace-config.atoms";
import {
  beneficiaryStreamStopIdAtom,
  streamingPaymentPayoutAmountsAtom,
  sttWalletInputsAtom,
  sttStateFormAtom
} from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { createDefaultStateForm, createDefaultUserFormState, stateFormFromDatum, stateFormToDatum } from "@/lib/contracts/state-form";
import { readStateSections } from "@/lib/contracts/state-layout";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import type { ConstrData } from "@/lib/types/contracts";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";

const mocks = vi.hoisted(() => ({ signAndSubmitTx: vi.fn(), buildPreparation: vi.fn(), buildMint: vi.fn() }));

vi.mock("@/lib/mesh/transactions", () => ({ signAndSubmitTx: mocks.signAndSubmitTx, buildBeneficiaryPreparationTx: mocks.buildPreparation, buildMintStateTokenTx: mocks.buildMint }));
vi.mock("@/components/user/workspace/workspace-transaction-refresh", () => ({
  schedulePostSubmitRefresh: vi.fn()
}));

import { createWorkspaceTransactions } from "./workspace-transactions";

function contextFor(store: ReturnType<typeof createStore>, editDuringBuild: (() => void) | null) {
  const setBuildError = vi.fn();
  const ctx = {
    activeBuild: null,
    activeSubmit: false,
    activeFieldErrors: {},
    activeReadinessIssues: [],
    activeWallet: {},
    activeWalletName: "lace",
    addSubmittedTransactionToActivity: vi.fn().mockResolvedValue(undefined),
    isDemoWallet: false,
    jotaiStore: store,
    lockingContract: { address: "addr_test1lock" },
    networkId: 0,
    proposalCaptureRef: { current: null },
    refreshLockedContractUtxos: vi.fn().mockResolvedValue(undefined),
    refreshPermissionWalletSummaries: vi.fn().mockResolvedValue(undefined),
    refreshWalletBalance: vi.fn().mockResolvedValue(undefined),
    rememberRecipients: vi.fn(),
    selectedAction: "lock-funds",
    setActiveSubmit: vi.fn(),
    setBuildError,
    setBuildErrorExpected: vi.fn(),
    setMintConfirmation: vi.fn(),
    setMintedWalletName: vi.fn(),
    setSubmitHash: vi.fn(),
    submitHash: null,
    submitInFlightRef: { current: false },
    watchMintCreationConfirmation: vi.fn(),
    withBuildGuard: async () => {
      editDuringBuild?.();
      return { txHex: "84a1", preview: { action: "lock-funds", summary: "" } };
    }
  } as unknown as WorkspaceTransactionsCtx;
  return { ctx, setBuildError };
}

beforeEach(() => {
  mocks.signAndSubmitTx.mockReset().mockResolvedValue("ff".repeat(32));
  mocks.buildPreparation.mockReset();
});

function detectedToken(datum: ConstrData | null): NonNullable<WorkspaceTransactionsCtx["selectedDetectedToken"]> {
  const policyId = "cc".repeat(28), assetNameHex = "01", scriptAddress = "addr_test1state";
  return {
    policyId, assetNameHex, unit: policyId + assetNameHex, scriptAddress, datum,
    utxo: {
      input: { txHash: "aa".repeat(32), outputIndex: 1 },
      output: { address: scriptAddress, amount: [{ unit: policyId + assetNameHex, quantity: "1" }] }
    }
  };
}

it("uses the configured setup helper when creating a wallet", async () => {
  const store = createStore();
  const reference = `${"aa".repeat(32)}#2`;
  store.set(configAtom, { ...store.get(configAtom), sttSpendReference: reference });
  const { ctx } = contextFor(store, null);
  ctx.withBuildGuard = (_label, run) => run();
  await createWorkspaceTransactions(ctx).buildMintTx();
  expect(mocks.buildMint).toHaveBeenCalledWith(ctx.activeWallet, expect.objectContaining({
    sttSpendReference: reference
  }));
});

it("refuses to sign when the draft changed while the transaction was being built", async () => {
  // Build-then-submit skipped the staleness check, so the wallet signed the click-time
  // draft while the screen showed the edit.
  const store = createStore();
  const { ctx, setBuildError } = contextFor(store, () =>
    store.set(lockFundsAssetsAtom, [{ unit: "lovelace", quantity: "5000000" }])
  );
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();

  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  expect(setBuildError).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});

it("treats an edited payout amount as a changed draft", async () => {
  // The payout amounts feed the build through a derived atom, so the snapshot has to
  // read the editable atom itself or a mid-build edit passes the check.
  const store = createStore();
  const { ctx, setBuildError } = contextFor(store, () =>
    store.set(streamingPaymentPayoutAmountsAtom, { "1": "1000000" })
  );
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();

  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  expect(setBuildError).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});

it("signs the freshly built transaction when the draft held still", async () => {
  const { ctx, setBuildError } = contextFor(createStore(), null);
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();

  expect(mocks.signAndSubmitTx).toHaveBeenCalledWith({}, "84a1");
  expect(setBuildError).not.toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});

it("compares a draft that contains an exact bigint State field", async () => {
  const store = createStore();
  const state = createDefaultStateForm();
  state.lastNonAdminPayoutAt = {
    alternative: 0,
    fields: [MAX_ON_CHAIN_STATE_INTEGER]
  };
  store.set(sttStateFormAtom, state);
  const { ctx, setBuildError } = contextFor(store, null);

  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();

  expect(mocks.signAndSubmitTx).toHaveBeenCalledWith({}, "84a1");
  expect(setBuildError).not.toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});

it("a stop target edit during build cannot lead to signing", async () => {
  const store = createStore();
  const { ctx, setBuildError } = contextFor(store, () => store.set(beneficiaryStreamStopIdAtom, "8"));
  ctx.selectedAction = "stop-beneficiary-stream";
  ctx.effectiveSttAction = "stop-beneficiary-stream";
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();
  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  expect(setBuildError).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});

it("a stop build always returns for explicit confirmation before signing", async () => {
  const { ctx } = contextFor(createStore(), null);
  ctx.selectedAction = "stop-beneficiary-stream";
  ctx.effectiveSttAction = "stop-beneficiary-stream";
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();
  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
});

it("an exact input edit during build cannot lead to signing", async () => {
  const store = createStore();
  const { ctx, setBuildError } = contextFor(store, () => store.set(sttWalletInputsAtom, [{ txHash: "aa".repeat(32), outputIndex: 1 }]));
  ctx.selectedAction = "distribute-beneficiaries";
  ctx.effectiveSttAction = "distribute-beneficiaries";
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();
  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  expect(setBuildError).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});
it("exact distribution returns for explicit confirmation before signing", async () => {
  const { ctx } = contextFor(createStore(), null);
  ctx.selectedAction = "distribute-beneficiaries";
  ctx.effectiveSttAction = "distribute-beneficiaries";
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();
  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
});

it("preparation always returns for a separate confirmation before signing", async () => {
  const store = createStore(); store.set(beneficiaryPreparationActiveAtom, true);
  const { ctx } = contextFor(store, null);
  ctx.selectedAction = "consolidate-utxo"; ctx.effectiveSttAction = "consolidate-utxo";
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();
  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
});
it("editing the requested preparation pool during build prevents signing", async () => {
  const store = createStore(); store.set(beneficiaryPreparationActiveAtom, true);
  const { ctx, setBuildError } = contextFor(store, () => store.set(beneficiaryPreparationPoolAssetsAtom, [{ unit: "lovelace", quantity: "3000000" }]));
  ctx.selectedAction = "consolidate-utxo"; ctx.effectiveSttAction = "consolidate-utxo";
  await createWorkspaceTransactions(ctx).buildAndSubmitSelectedActionTx();
  expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  expect(setBuildError).toHaveBeenCalledWith(expect.stringMatching(/stale/i));
});

it("preparation builds the derived beneficiary intent without stale output layouts or admin overrides", async () => {
  const store = createStore();
  store.set(beneficiaryPreparationActiveAtom, true);
  store.set(beneficiaryPreparationPoolAssetsAtom, [{ unit: "lovelace", quantity: "3000000" }]);
  store.set(consolidateSttInputHashAtom, "aa".repeat(32)); store.set(consolidateSttInputIndexAtom, "1");
  const refs = [{ txHash: "bb".repeat(32), outputIndex: 0 }]; store.set(consolidateWalletInputsAtom, refs);
  store.set(consolidateWalletOutputsAtom, [{ amount: [{ unit: "lovelace", quantity: "1" }], inlineDatum: { mode: "none", customAlternative: "" } }]);
  const { ctx } = contextFor(store, null);
  ctx.selectedAction = "consolidate-utxo"; ctx.effectiveSttAction = "consolidate-utxo";
  ctx.activePaymentKeyHash = "11".repeat(28); ctx.activeInferredSttStateForm = createDefaultStateForm();
  ctx.selectedDetectedToken = detectedToken(stateFormToDatum(ctx.activeInferredSttStateForm));
  ctx.withBuildGuard = (_label, run) => run();
  mocks.buildPreparation.mockResolvedValueOnce({ txHex: "prepared" });
  await createWorkspaceTransactions(ctx).buildSelectedActionTx("admin");
  expect(mocks.buildPreparation).toHaveBeenCalledWith(ctx.activeWallet, expect.any(Object), {
    sttInputTxHash: "aa".repeat(32), sttInputOutputIndex: 1, walletInputs: refs,
    beneficiarySignerKeyHash: "11".repeat(28), poolAssets: [{ unit: "lovelace", quantity: "3000000" }], expectedStateDatum: stateFormToDatum(ctx.activeInferredSttStateForm)
  });
  expect(ctx.proposalCaptureRef.current).toBeNull();
});

it("preparation uses the raw reviewed State even when its form normalizes admin fields", async () => {
  const store = createStore();
  store.set(beneficiaryPreparationActiveAtom, true);
  const form = createDefaultStateForm();
  form.users = [{ ...createDefaultUserFormState(), wallets: ["11".repeat(28)], isAdmin: true }];
  const datum = stateFormToDatum(form);
  const admin = readStateSections(datum).users[0] as ConstrData;
  admin.fields[5] = { alternative: 0, fields: [] };
  expect(validateStateDatum(datum)).toEqual([]);
  const { ctx } = contextFor(store, null);
  ctx.selectedAction = "consolidate-utxo";
  ctx.effectiveSttAction = "consolidate-utxo";
  ctx.activePaymentKeyHash = "22".repeat(28);
  ctx.selectedDetectedToken = detectedToken(datum);
  ctx.activeInferredSttStateForm = stateFormFromDatum(datum);
  expect(stateFormToDatum(ctx.activeInferredSttStateForm)).not.toEqual(datum);
  ctx.withBuildGuard = (_label, run) => run();
  mocks.buildPreparation.mockResolvedValueOnce({ txHex: "prepared" });

  await createWorkspaceTransactions(ctx).buildSelectedActionTx();

  expect(mocks.buildPreparation).toHaveBeenCalledWith(
    ctx.activeWallet, expect.any(Object), expect.objectContaining({ expectedStateDatum: datum })
  );
});

it.each([null, detectedToken(null)])("preparation requires the reviewed raw datum before building (%j)", async (token) => {
  const store = createStore();
  store.set(beneficiaryPreparationActiveAtom, true);
  const { ctx } = contextFor(store, null);
  ctx.selectedAction = "consolidate-utxo";
  ctx.effectiveSttAction = "consolidate-utxo";
  ctx.selectedDetectedToken = token;
  ctx.activeInferredSttStateForm = createDefaultStateForm();
  ctx.withBuildGuard = (_label, run) => run();

  await expect(createWorkspaceTransactions(ctx).buildSelectedActionTx()).rejects.toThrow(/stale.*refresh/i);
  expect(mocks.buildPreparation).not.toHaveBeenCalled();
});
