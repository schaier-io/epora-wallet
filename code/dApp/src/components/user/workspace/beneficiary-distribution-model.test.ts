import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStateForm, createDefaultBeneficiaryFormState } from "@/lib/contracts/state-form";
import { deriveBeneficiaryDistributionPreview } from "./beneficiary-distribution-model";
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
  return { form, signer: KEY, selectedRefs: [ref], utxos: [{ input: ref, output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "6000000" }, { unit: UNIT, quantity: "9" }] } }], nowMs: NOW, sttInput: { txHash: "cd".repeat(32), outputIndex: 1 } };
}
test("distribution derives every exact share and destination without changing the form", () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = deriveBeneficiaryDistributionPreview(input);
  assert.equal(result.error, null);
  assert.deepEqual(result.details?.payouts.map(p => ({ id: p.beneficiaryId, address: p.address, amount: p.amount })), [
    { id: 1, address: ADDRESS, amount: [{ unit: "lovelace", quantity: "2000000" }, { unit: UNIT, quantity: "3" }] },
    { id: 2, address: ADDRESS, amount: [{ unit: "lovelace", quantity: "4000000" }, { unit: UNIT, quantity: "6" }] }
  ]);
  assert.deepEqual(input, before);
});
test("distribution blocks missing, duplicate, multiple, stale and loading selections", () => {
  const input = fixture();
  for (const update of [{ selectedRefs: [] }, { selectedRefs: [...input.selectedRefs, ...input.selectedRefs] }, { utxos: [] }, { utxos: [...input.utxos, ...input.utxos] }, { loading: true }, { discoveryError: "Chain unavailable" }, { signer: null }]) {
    const result = deriveBeneficiaryDistributionPreview({ ...input, ...update });
    assert.equal(result.details, null);
    assert.ok(result.error);
  }
});
test("distribution blocks indivisible assets, locked recipients and unsettled streams", () => {
  const indivisible = fixture(); indivisible.utxos[0]!.output.amount[1]!.quantity = "1";
  assert.match(deriveBeneficiaryDistributionPreview(indivisible).error!, /cannot be split exactly/);
  const locked = fixture(); locked.form.beneficiaries[1]!.unlockAfterMode = "some"; locked.form.beneficiaries[1]!.unlockAfter = String(NOW + 86400000);
  assert.match(deriveBeneficiaryDistributionPreview(locked).error!, /still locked/);
  const debt = fixture(); debt.form.streamingPayments = [{ id: "1", payoutAddress: ADDRESS, policyId: "", assetName: "", amountPerDay: "86400", paidOutAmount: "0", startDate: String(NOW - 86400000), endDate: String(NOW + 86400000) }];
  assert.match(deriveBeneficiaryDistributionPreview(debt).error!, /settled and removed/);
});
