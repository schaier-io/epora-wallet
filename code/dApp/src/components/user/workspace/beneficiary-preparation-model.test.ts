import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStateForm, createDefaultBeneficiaryFormState } from "@/lib/contracts/state-form";
import { deriveBeneficiaryPreparationPreview } from "./beneficiary-preparation-model";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import type { Asset } from "@/lib/types/contracts";
const NOW = 1_750_000_000_000;
const KEY = "11".repeat(28);
const ADDRESS = "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
const UNIT = "cc".repeat(28) + "01";
function fixture() {
  const form = createDefaultStateForm();
  form.proofOfLifeUnlockTimeMode = "some";
  form.proofOfLifeUnlockTime = "1000";
  form.proofOfLifeIncrementMode = "some";
  form.proofOfLifeIncrement = "1000";
  form.beneficiaries = [1, 2].map((id) => ({ ...createDefaultBeneficiaryFormState(String(id)), wallets: [id === 1 ? KEY : "22".repeat(28)], payoutAddress: ADDRESS, weight: String(id) }));
  const ref = { txHash: "ab".repeat(32), outputIndex: 0 };
  return { poolAssets: [] as Asset[], walletAddress: ADDRESS, protocolParams: DEFAULT_PROTOCOL_PARAMETERS, loading: false, discoveryError: null, protocolError: false, form, signer: KEY, selectedRefs: [ref], utxos: [{ input: ref, output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "6000000" }, { unit: UNIT, quantity: "9" }] } }], nowMs: NOW, sttInput: { txHash: "cd".repeat(32), outputIndex: 1 } };
}

test("preparation merges selected funds and preserves an immutable remainder when splitting", () => {
  const input = fixture(); const before = structuredClone(input);
  const merge = deriveBeneficiaryPreparationPreview(input);
  assert.equal(merge.error, null); assert.equal(merge.plan?.pool, null); assert.equal(merge.plan?.isReady, true);
  const split = deriveBeneficiaryPreparationPreview({ ...input, poolAssets: [{ unit: "lovelace", quantity: "3000000" }, { unit: UNIT, quantity: "3" }] });
  assert.equal(split.error, null); assert.equal(split.plan?.isReady, true);
  assert.deepEqual(split.plan?.remainder, [{ unit: "lovelace", quantity: "3000000" }, { unit: UNIT, quantity: "6" }]);
  assert.deepEqual(input, before);
});
test("preparation distinguishes reallocating wallet ADA from a deposit deficit", () => {
  const input = fixture();
  const allocation = deriveBeneficiaryPreparationPreview({ ...input, poolAssets: [{ unit: UNIT, quantity: "3" }] });
  assert.equal(allocation.plan?.depositShortfall, 0n);
  assert.equal(allocation.plan?.isReady, false);
  assert.ok(allocation.plan!.suggestedPoolLovelace! > 0n);
  const corrected = deriveBeneficiaryPreparationPreview({ ...input, poolAssets: [{ unit: "lovelace", quantity: String(allocation.plan!.suggestedPoolLovelace) }, { unit: UNIT, quantity: "3" }] });
  assert.equal(corrected.plan?.isReady, true);
  input.utxos[0]!.output.amount[0]!.quantity = "1000000";
  const deposit = deriveBeneficiaryPreparationPreview({ ...input, poolAssets: [{ unit: UNIT, quantity: "3" }] });
  assert.ok(deposit.plan!.depositShortfall > 0n);
  assert.equal(deposit.plan?.suggestedPoolLovelace, null);
});
test("preparation rejects stale discovery, locked beneficiaries and indivisible requested values", () => {
  const input = fixture();
  for (const update of [{ selectedRefs: [] }, { selectedRefs: [...input.selectedRefs, ...input.selectedRefs] }, { utxos: [] }, { loading: true }, { signer: null }, { protocolParams: null }]) {
    assert.equal(deriveBeneficiaryPreparationPreview({ ...input, ...update }).plan, null);
  }
  input.form.proofOfLifeUnlockTime = String(NOW + 86400000);
  assert.match(deriveBeneficiaryPreparationPreview(input).error!, /unlocked/);
  const indivisible = deriveBeneficiaryPreparationPreview({ ...fixture(), poolAssets: [{ unit: UNIT, quantity: "1" }] });
  assert.match(indivisible.error!, /multiple/);
});
