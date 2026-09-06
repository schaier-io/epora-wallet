import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStateForm, createDefaultBeneficiaryFormState } from "@/lib/contracts/state-form";
import { deriveBeneficiaryStreamStopPreview } from "./beneficiary-stream-stop-model";
import { getValidityWindow } from "@/lib/mesh/transactions";
const NOW = 1_750_000_000_000;
const KEY = "11".repeat(28);
const ADDRESS = "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
function form() {
  const value = createDefaultStateForm();
  value.proofOfLifeUnlockTimeMode = "some";
  value.proofOfLifeUnlockTime = "1000";
  value.proofOfLifeIncrementMode = "some";
  value.proofOfLifeIncrement = "1000";
  value.beneficiaries = [{ ...createDefaultBeneficiaryFormState("1"), wallets: [KEY], payoutAddress: ADDRESS }];
  value.streamingPayments = [{ id: "7", payoutAddress: ADDRESS, policyId: "", assetName: "", amountPerDay: "86400", paidOutAmount: "0", startDate: String(NOW - 86400000), endDate: String(NOW + 86400000) }];
  return value;
}
test("stop preview derives cutoff debt without mutating the source form", () => {
  const input = form();
  const before = structuredClone(input);
  const result = deriveBeneficiaryStreamStopPreview(input, KEY, "7", NOW);
  assert.equal(result.error, null);
  assert.equal(result.details?.cutoff, BigInt(getValidityWindow(NOW).latestTimeMs));
  assert.ok(result.details!.retainedDebt > 86400n);
  assert.deepEqual(input, before);
});
test("stop preview blocks missing targets, locked actors, no-op stops and shared cooldown", () => {
  assert.match(deriveBeneficiaryStreamStopPreview(form(), KEY, "", NOW).error!, /Select/);
  const locked = form(); locked.proofOfLifeUnlockTime = String(NOW + 86400000);
  assert.match(deriveBeneficiaryStreamStopPreview(locked, KEY, "7", NOW).error!, /unlocked/);
  const ended = form(); ended.streamingPayments[0]!.endDate = String(NOW);
  assert.match(deriveBeneficiaryStreamStopPreview(ended, KEY, "7", NOW).error!, /ends too soon/);
  const cooldown = form(); cooldown.lastNonAdminPayoutAt = { alternative: 0, fields: [NOW - 60000] };
  assert.match(deriveBeneficiaryStreamStopPreview(cooldown, KEY, "7", NOW).error!, /30-minute/);
});
