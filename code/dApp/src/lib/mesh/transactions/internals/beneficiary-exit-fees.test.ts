import assert from "node:assert/strict";
import test from "node:test";
import { MeshTxBuilder, pubKeyAddress, serializeAddressObj, type Transaction } from "@meshsdk/core";
import { beneficiaryExitExternalFeeLowerBound, captureBeneficiaryExitFeeEvidence, type BeneficiaryExitFeeEvidence } from "./beneficiary-exit-fees";

const STATE = serializeAddressObj(pubKeyAddress("11".repeat(28)), 0);
const WALLET = serializeAddressObj(pubKeyAddress("22".repeat(28)), 0);
const PAYOUT = serializeAddressObj(pubKeyAddress("33".repeat(28)), 0);

function transaction(payoutLovelace: string): string {
  // Serialized local fixture only. No provider, signatures, or submission.
  return new MeshTxBuilder()
    .txIn("aa".repeat(32), 0, [{ unit: "lovelace", quantity: "10200000" }], STATE)
    .txOut(STATE, [{ unit: "lovelace", quantity: "2000000" }])
    .txOut(WALLET, [{ unit: "lovelace", quantity: "3000000" }])
    .txOut(PAYOUT, [{ unit: "lovelace", quantity: payoutLovelace }])
    .setFee("200000")
    .completeSync();
}

function evidence(): BeneficiaryExitFeeEvidence {
  return {
    smartInputLovelace: "10000000",
    outputs: [
      { index: 0, address: STATE, lovelace: "2000000" },
      { index: 1, address: WALLET, lovelace: "3000000" },
      { index: 2, address: PAYOUT, lovelace: "5000000" }
    ]
  };
}

test("exit fee accounting identifies external fees when smart inputs are fully allocated", () => {
  assert.equal(beneficiaryExitExternalFeeLowerBound(transaction("5000000"), evidence()), 200_000n);
  assert.equal(beneficiaryExitExternalFeeLowerBound(transaction("5100000"), evidence()), 200_000n);
});

test("exit fee accounting measures partial external funding after payout reduction", () => {
  assert.equal(beneficiaryExitExternalFeeLowerBound(transaction("4900000"), evidence()), 100_000n);
  assert.equal(beneficiaryExitExternalFeeLowerBound(transaction("4800000"), evidence()), 0n);
});

test("exit fee accounting does not let an external topup hide another output reduction", () => {
  const input = evidence();
  input.outputs[0]!.lovelace = "2100000";
  input.outputs[2]!.lovelace = "4900000";
  assert.equal(beneficiaryExitExternalFeeLowerBound(transaction("5000000"), input), 100_000n);
});

test("exit fee accounting reports unavailable evidence for mismatches and unallocated smart ADA", () => {
  const tx = transaction("5000000");
  const wrongAddress = evidence();
  wrongAddress.outputs[2]!.address = STATE;
  assert.equal(beneficiaryExitExternalFeeLowerBound(tx, wrongAddress), null);
  const wrongIndex = evidence();
  wrongIndex.outputs[2]!.index = 1;
  assert.equal(beneficiaryExitExternalFeeLowerBound(tx, wrongIndex), null);
  assert.equal(beneficiaryExitExternalFeeLowerBound(tx, { ...evidence(), smartInputLovelace: "10000001" }), null);
});


test("exit fee evidence snapshots every prepared output before balancing mutates its amount", () => {
  const output = { address: STATE, amount: [{ unit: "lovelace", quantity: "2000000" }] };
  const tx = { txBuilder: { meshTxBuilderBody: { outputs: [output] } } } as unknown as Transaction;
  const captured = captureBeneficiaryExitFeeEvidence(tx, 2_000_000n);
  output.amount[0]!.quantity = "1900000";
  assert.deepEqual(captured, { smartInputLovelace: "2000000", outputs: [{ index: 0, address: STATE, lovelace: "2000000" }] });
});
