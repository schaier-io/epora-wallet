import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { scriptAddress, serializeAddressObj } from "@meshsdk/core";
import { TransactionOutput, toCardanoAddress, toValue } from "@meshsdk/core-cst";
import { createDefaultStateForm, createDefaultBeneficiaryFormState, stateFormToDatum } from "./state-form";
import { planBeneficiaryRecoveryPreparation, assertBeneficiaryPreparationAuthority } from "./beneficiary-recovery-preparation";
import type { Asset } from "@/lib/types/contracts";
const KEY = "11".repeat(28);
const ADDRESS = serializeAddressObj(scriptAddress("aa".repeat(28), "bb".repeat(28), true), 0);
const UNIT = "cc".repeat(28) + "01";
function state(weights = [2, 6]) {
  const form = createDefaultStateForm();
  form.proofOfLifeUnlockTimeMode = "some";
  form.proofOfLifeUnlockTime = "100";
  form.proofOfLifeIncrementMode = "some";
  form.proofOfLifeIncrement = "60";
  form.beneficiaries = weights.map((weight, index) => ({
    ...createDefaultBeneficiaryFormState(String(index + 1)),
    wallets: [index ? "22".repeat(28) : KEY], weight: String(weight), payoutAddress: ADDRESS
  }));
  return stateFormToDatum(form);
}
const assets = (ada: string, quantity = "5"): Asset[] => [{ unit: "lovelace", quantity: ada }, { unit: UNIT, quantity }];
function plan(selected = assets("10000000"), pool = assets("8000000", "4"), weights = [2, 6]) {
  return planBeneficiaryRecoveryPreparation({ stateDatum: state(weights), selectedAmount: selected, poolAssets: pool, walletAddress: ADDRESS, protocolParams: DEFAULT_PROTOCOL_PARAMETERS });
}
test("preparation computes the minimal exact quantum and immutable native remainder without changing inputs", () => {
  const selected = assets("10000000");
  const pool = assets("8000000", "4");
  const original = structuredClone({ selected, pool });
  const result = plan(selected, pool);
  assert.equal(result.quantum, 4n);
  assert.deepEqual(result.pool, pool);
  assert.deepEqual(result.remainder, assets("2000000", "1"));
  assert.equal(result.isReady, true);
  assert.equal(result.depositShortfall, 0n);
  assert.deepEqual({ selected, pool }, original);
  for (const unit of ["lovelace", UNIT]) {
    assert.equal(result.walletOutputs.reduce((total, output) => total + BigInt(output.amount.find(asset => asset.unit === unit)?.quantity ?? "0"), 0n), BigInt(selected.find(asset => asset.unit === unit)!.quantity));
  }
});
test("empty pool intent merges even indivisible assets without claiming a clean pool", () => {
  const result = plan(assets("5000001", "1"), []);
  assert.equal(result.pool, null);
  assert.equal(result.walletOutputs.length, 1);
  assert.deepEqual(result.remainder, assets("5000001", "1"));
  assert.equal(result.isReady, true);
});
test("preparation rejects native and ADA rounding, overdraw and malformed asset identities", () => {
  assert.throws(() => plan(undefined, assets("8000000", "3")), /multiple of 4/);
  assert.throws(() => plan(undefined, assets("8000001", "4")), /multiple of 4/);
  assert.throws(() => plan(undefined, assets("12000000", "4")), /exceeds/);
  assert.throws(() => plan(undefined, [{ unit: "invalid", quantity: "4" }]), /policy|characters/);
});
test("minimum ADA uses selected funds and distinguishes deposit deficits from reallocation", () => {
  const deposit = plan(assets("1500000"), assets("1000000", "4"));
  assert.equal(deposit.isReady, false);
  assert.ok(deposit.depositShortfall > 0n);
  assert.equal(deposit.suggestedPoolLovelace, null);
  const reallocate = plan(assets("10000000"), assets("1000000", "4"));
  assert.equal(reallocate.isReady, false);
  assert.equal(reallocate.depositShortfall, 0n);
  assert.ok(reallocate.poolLovelaceShortfall > 0n);
  const corrected = plan(assets("10000000"), assets(String(reallocate.suggestedPoolLovelace), "4"));
  assert.equal(corrected.isReady, true);
});
test("ADA-only dust remainder suggests all ADA when all native assets fit the pool", () => {
  const result = plan(assets("10000000", "4"), assets("9999996", "4"));
  assert.equal(result.isReady, false);
  assert.equal(result.depositShortfall, 0n);
  assert.equal(result.suggestedPoolLovelace, 10000000n);
  assert.deepEqual(plan(assets("10000000", "4"), assets(String(result.suggestedPoolLovelace), "4")).remainder, []);
  const notDivisible = plan(assets("10000001", "4"), assets("9999996", "4"));
  assert.equal(notDivisible.depositShortfall, 0n);
  assert.equal(plan(assets("10000001", "4"), assets(String(notDivisible.suggestedPoolLovelace), "4")).isReady, true);
});
test("full selected pool omits empty remainder and dense values have no native asset cap", () => {
  const dense = [{ unit: "lovelace", quantity: "8000000" }, ...Array.from({ length: 8 }, (_, index) => ({ unit: "cc".repeat(28) + index.toString(16).padStart(2, "0"), quantity: "4" }))];
  const result = plan(dense, dense);
  assert.equal(result.walletOutputs.length, 1);
  assert.deepEqual(result.remainder, []);
  assert.equal(result.isReady, true);
});
test("live minimum-ADA parameters and actual large-coin serialization are respected", () => {
  const amount = assets("8000000000", "4");
  const params = { ...DEFAULT_PROTOCOL_PARAMETERS, coinsPerUtxoSize: DEFAULT_PROTOCOL_PARAMETERS.coinsPerUtxoSize * 2 };
  const result = planBeneficiaryRecoveryPreparation({ stateDatum: state(), selectedAmount: amount, poolAssets: amount, walletAddress: ADDRESS, protocolParams: params });
  const output = new TransactionOutput(toCardanoAddress(ADDRESS), toValue(amount));
  const actualMinimum = BigInt(160 + String(output.toCbor()).length / 2) * BigInt(params.coinsPerUtxoSize);
  assert.ok(result.minimumPoolLovelace >= actualMinimum);
  assert.equal(result.isReady, true);
});
test("preparation uses beneficiary unlock authority without requiring streams empty or changing cadence", () => {
  const datum = state();
  assert.equal(assertBeneficiaryPreparationAuthority(datum, KEY, 100), 1);
  assert.throws(() => assertBeneficiaryPreparationAuthority(datum, KEY, 99), /unlocked/);
  assert.throws(() => assertBeneficiaryPreparationAuthority(datum, "99".repeat(28), 100), /exactly one beneficiary/);
  assert.throws(() => assertBeneficiaryPreparationAuthority(datum, KEY, Infinity), /unlocked/);
});
