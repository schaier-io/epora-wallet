import assert from "node:assert/strict";
import test from "node:test";
import { MeshTxBuilder, pubKeyAddress, scriptAddress, serializeAddressObj } from "@meshsdk/core";
import type { PreparationOutputEvidence } from "./beneficiary-preparation";
import { assertBeneficiaryPreparationOutputs } from "./beneficiary-preparation-output-checks";
const STATE = serializeAddressObj(scriptAddress("aa".repeat(28)), 0);
const WALLET = serializeAddressObj(scriptAddress("bb".repeat(28), "cc".repeat(28), true), 0);
const CHANGE = serializeAddressObj(pubKeyAddress("11".repeat(28)), 0);
const UNIT = "ee".repeat(28) + "01";
const ada = (quantity: string) => ({ unit: "lovelace", quantity });
function evidence(): PreparationOutputEvidence {
  return {
    stateInput: { input: { txHash: "22".repeat(32), outputIndex: 0 }, output: { address: STATE, amount: [ada("2000000")] } },
    walletInputs: [{ input: { txHash: "33".repeat(32), outputIndex: 0 }, output: { address: WALLET, amount: [ada("10000000"), { unit: UNIT, quantity: "5" }] } }],
    stateDatum: { alternative: 0, fields: [] }, walletAddress: WALLET, changeAddress: CHANGE,
    walletOutputs: [{ amount: [ada("8000000"), { unit: UNIT, quantity: "4" }] }, { amount: [ada("2000000"), { unit: UNIT, quantity: "1" }] }]
  };
}
function encoded(plan: PreparationOutputEvidence, mutation = "") {
  const tx = new MeshTxBuilder().txIn(plan.stateInput.input.txHash, 0, plan.stateInput.output.amount, STATE);
  if (mutation !== "missing-input") tx.txIn(plan.walletInputs[0]!.input.txHash, 0, plan.walletInputs[0]!.output.amount, WALLET);
  tx.txOut(STATE, plan.stateInput.output.amount).txOutInlineDatumValue(plan.stateDatum, "Mesh");
  if (mutation === "state-reference") tx.txOutReferenceScript("450100002499", "V3");
  for (const [index, output] of plan.walletOutputs.entries()) {
    const amount = structuredClone(output.amount);
    if (index === 0 && mutation === "fee") amount[0]!.quantity = "7999999";
    if (index === 0 && mutation === "topup") amount[0]!.quantity = "8000001";
    if (index === 0 && mutation === "native") amount[1]!.quantity = "3";
    const address = mutation === "stake" ? serializeAddressObj(scriptAddress("bb".repeat(28)), 0) : WALLET;
    tx.txOut(address, amount);
  }
  if (mutation === "extra-output") tx.txOut(CHANGE, [ada("1000000")]).txOutInlineDatumValue({ alternative: 0, fields: [] }, "Mesh");
  return tx.setFee("0").completeSync();
}
test("preparation evidence accepts exact output plan and rejects fee deductions, topups, native or full address changes", () => {
  const plan = evidence();
  assert.doesNotThrow(() => assertBeneficiaryPreparationOutputs(encoded(plan), plan));
  for (const mutation of ["fee", "topup", "native", "stake", "missing-input", "extra-output", "state-reference"]) {
    assert.throws(() => assertBeneficiaryPreparationOutputs(encoded(plan, mutation), plan), /Recovery preparation/, mutation);
  }
});
