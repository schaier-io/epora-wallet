import assert from "node:assert/strict";
import test from "node:test";

import {
  computeActionSignature,
  type BuildActionSignatureCtx
} from "@/components/user/workspace/workspace-action-signature";
import { prepareStreamingPaymentPayout } from "@/components/user/workspace/workspace-payout-preparation";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import { EMPTY_CONTRACT_CONFIG, type PayoutTransfer } from "@/lib/types/contracts";

function payoutTransfer(quantity: string): PayoutTransfer {
  return {
    address: "addr_test1vrpayout",
    amount: [{ unit: "lovelace", quantity }],
    inlineDatum: {
      alternative: 0,
      fields: [7, "a".repeat(64), 0]
    }
  };
}

function payoutContext(quantity: string): BuildActionSignatureCtx {
  return {
    activePaymentKeyHash: "payment-key-hash",
    config: EMPTY_CONTRACT_CONFIG,
    selectedDetectedToken: null,
    selectedDetectedTokenStateForm: null,
    sttAuthorityPath: "admin",
    sttExtraTransfers: [],
    sttInputOutputIndex: "0",
    sttInputTxHash: "a".repeat(64),
    sttOutputAssets: [],
    sttProofOfLifeOverrideMode: "unchanged",
    sttProofOfLifeSpecificDateTime: "",
    sttStateForm: {},
    sttWalletInputs: [],
    sttWalletOutputs: [],
    sttZeroAdminConfirmed: false,
    streamingPaymentPayout: prepareStreamingPaymentPayout([payoutTransfer(quantity)])
  } as unknown as BuildActionSignatureCtx;
}

test("scheduled payout amount changes invalidate the built preview signature", () => {
  const firstSignature = computeActionSignature(
    "payout-streaming-payment",
    payoutContext("1000000")
  );
  const changedSignature = computeActionSignature(
    "payout-streaming-payment",
    payoutContext("2000000")
  );

  assert.notEqual(changedSignature, firstSignature);
});

test("scheduled payout transfers do not affect other STT action signatures", () => {
  const firstSignature = computeActionSignature("use", payoutContext("1000000"));
  const changedSignature = computeActionSignature("use", payoutContext("2000000"));

  assert.equal(changedSignature, firstSignature);
});

test("changing the stop target or signer invalidates its preview", () => {
  const ctx = { ...payoutContext("0"), beneficiaryStreamStopId: "1" };
  const signature = computeActionSignature("stop-beneficiary-stream", ctx);
  assert.notEqual(signature, computeActionSignature("stop-beneficiary-stream", { ...ctx, beneficiaryStreamStopId: "2" }));
  assert.notEqual(signature, computeActionSignature("stop-beneficiary-stream", { ...ctx, activePaymentKeyHash: "another-key" }));
});

test("exact distribution invalidates its preview when selected input, actor or State changes", () => {
  const ref = { txHash: "b".repeat(64), outputIndex: 0 };
  const utxo = { input: ref, output: { address: "wallet", amount: [{ unit: "lovelace", quantity: "6000000" }] } };
  const ctx = { ...payoutContext("0"), sttWalletInputs: [ref], lockedContractUtxos: [utxo] };
  const signature = computeActionSignature("distribute-beneficiaries", ctx);
  for (const update of [
    { sttWalletInputs: [{ ...ref, outputIndex: 1 }] },
    { activePaymentKeyHash: "another-key" },
    { selectedDetectedTokenStateForm: { beneficiaries: [] } as never },
    { sttStateForm: { beneficiaries: [] } as never },
    { lockedContractUtxos: [{ ...utxo, output: { ...utxo.output, amount: [{ unit: "lovelace", quantity: "9000000" }] } }] }
  ]) assert.notEqual(signature, computeActionSignature("distribute-beneficiaries", { ...ctx, ...update }));
});

test("preparation preview binds requested pool, actual selected funds, State and signer", () => {
  const ref = { txHash: "b".repeat(64), outputIndex: 0 };
  const utxo = { input: ref, output: { address: "wallet", amount: [{ unit: "lovelace", quantity: "6000000" }] } };
  const ctx = { ...payoutContext("0"), beneficiaryPreparationActive: true, beneficiaryPreparationPoolAssets: [], consolidateWalletInputs: [ref], lockedContractUtxos: [utxo] };
  const signature = computeActionSignature("consolidate-utxo", ctx);
  for (const update of [
    { beneficiaryPreparationPoolAssets: [{ unit: "lovelace", quantity: "3000000" }] },
    { activePaymentKeyHash: "another-key" },
    { selectedDetectedTokenStateForm: { beneficiaries: [] } as never },
    { consolidateStateForm: { beneficiaries: [] } as never },
    { lockedContractUtxos: [] },
    { beneficiaryPreparationActive: false }
  ]) assert.notEqual(signature, computeActionSignature("consolidate-utxo", { ...ctx, ...update }));
});

function stakeCredentialContext(sttTxHash: string): BuildActionSignatureCtx {
  return {
    activeInferredSttStateForm: createDefaultStateForm(),
    activePaymentKeyHash: "payment-key-hash",
    config: EMPTY_CONTRACT_CONFIG,
    selectedDetectedToken: {
      unit: `${"b".repeat(56)}wallet`,
      utxo: { input: { txHash: sttTxHash, outputIndex: 0 } }
    },
    selectedDetectedTokenStateForm: null,
    walletOperatorPath: "admin"
  } as unknown as BuildActionSignatureCtx;
}

test("switching the wallet invalidates an Enable staking preview signature", () => {
  // The action has no form fields, so before it had a case of its own it fell to
  // `default: ""` and the staleness check compared "" to "": a preview built for
  // one wallet still read as current after the workspace opened another.
  const firstSignature = computeActionSignature(
    "set-intended-stake-credential",
    stakeCredentialContext("a".repeat(64))
  );
  const changedSignature = computeActionSignature(
    "set-intended-stake-credential",
    stakeCredentialContext("c".repeat(64))
  );

  assert.notEqual(changedSignature, firstSignature);
  assert.notEqual(firstSignature, "");
});

test("Enable staking binds the State, operator path and current signer", () => {
  const ctx = stakeCredentialContext("a".repeat(64));
  const signature = computeActionSignature("set-intended-stake-credential", ctx);
  for (const update of [
    { activeInferredSttStateForm: { ...ctx.activeInferredSttStateForm, walletName: "Changed" } },
    { selectedDetectedTokenStateForm: { ...ctx.activeInferredSttStateForm, walletName: "Detected" } },
    { walletOperatorPath: "multisig" as const },
    { activePaymentKeyHash: "another-key" }
  ]) {
    assert.notEqual(signature, computeActionSignature("set-intended-stake-credential", { ...ctx, ...update }));
  }
});
