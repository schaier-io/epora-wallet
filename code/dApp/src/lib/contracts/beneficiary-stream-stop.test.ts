import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStateForm, createDefaultBeneficiaryFormState, stateFormToDatum, withFallbackAdminUserInStateForm, type StateFormState } from "./state-form";
import { deriveBeneficiaryStreamStopStateDatum } from "./beneficiary-stream-stop";
import { buildSttSpendRedeemerData, resolveStructuredOnChainAction } from "./action-data";
import type { ConstrData } from "@/lib/types/contracts";

const KEY = "11".repeat(28);
const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const DAY = 86_400_000;
const EARLIEST = DAY * 5;
const LATEST = EARLIEST + 240_000;
function form(): StateFormState {
  return { ...createDefaultStateForm(), proofOfLifeUnlockTimeMode: "some" as const,
    proofOfLifeUnlockTime: "1", proofOfLifeIncrementMode: "some" as const, proofOfLifeIncrement: "60",
    beneficiaries: [{ ...createDefaultBeneficiaryFormState("9"), wallets: [KEY], weight: "1", payoutAddress: ADDRESS }],
    streamingPayments: [{ id: "7", payoutAddress: ADDRESS, paidOutAmount: "2", policyId: "", assetName: "",
      amountPerDay: "2", startDate: "0", endDate: String(DAY * 10) }]
  };
}
function stop(stateDatum = stateFormToDatum(form()), changes = {}) {
  return deriveBeneficiaryStreamStopStateDatum({stateDatum, beneficiarySignerKeyHash: KEY,
    streamingPaymentId: 7, txEarliestTimeMs: EARLIEST, txLatestTimeMs: LATEST, ...changes});
}
test("beneficiary stop preserves every field except selected end and shared stamp, retaining debt", () => {
  const state = form();
  state.streamingPayments.push({...state.streamingPayments[0]!, id: "8"});
  const datum = stateFormToDatum(state);
  const before = structuredClone(datum);
  const result = stop(datum);
  assert.equal(result.beneficiaryId, 9);
  assert.equal(result.streamingPaymentId, 7n);
  assert.equal(result.oldEndDate, DAY * 10);
  assert.equal(result.cutoff, BigInt(LATEST));
  assert.equal(result.paidOutAmount, 2n);
  assert.equal(result.retainedDebt, 8n);
  assert.equal(result.unit, "lovelace");
  const expected = structuredClone(datum);
  ((expected.fields[2] as ConstrData[])[0]!).fields[7] = LATEST;
  expected.fields[5] = {alternative: 0, fields: [LATEST]};
  assert.deepEqual(result.outputDatum, expected);
  assert.deepEqual(datum, before);
});
test("beneficiary stop requires signer membership and both unlock times", () => {
  assert.throws(() => stop(undefined, {beneficiarySignerKeyHash: "22".repeat(28)}), /exactly one beneficiary/);
  const state = form();
  state.proofOfLifeUnlockTime = String(EARLIEST + 1);
  assert.throws(() => stop(stateFormToDatum(state)), /unlocked beneficiary/);
  state.proofOfLifeUnlockTime = "1";
  state.beneficiaries[0]!.unlockAfterMode = "some";
  state.beneficiaries[0]!.unlockAfter = String(EARLIEST + 1);
  assert.throws(() => stop(stateFormToDatum(state)), /unlocked beneficiary/);
  state.beneficiaries[0]!.unlockAfter = String(EARLIEST);
  assert.doesNotThrow(() => stop(stateFormToDatum(state)));
  state.proofOfLifeUnlockTimeMode = "none";
  assert.throws(() => stop(stateFormToDatum(state)), /unlocked beneficiary/);
});
test("beneficiary stop rejects unknown, stale, duplicate and invalid ids", () => {
  assert.throws(() => stop(undefined, {streamingPaymentId: 99}), /unknown streaming payment/);
  assert.throws(() => stop(undefined, {streamingPaymentId: -1}), /must be between/);
  const state = form(); state.streamingPayments[0]!.endDate = String(LATEST);
  assert.throws(() => stop(stateFormToDatum(state)), /ends too soon/);
  state.streamingPayments[0]!.endDate = String(DAY * 10);
  state.streamingPayments.push({...state.streamingPayments[0]!});
  assert.throws(() => stop(stateFormToDatum(state)), /exactly one matching/);
});
test("beneficiary stop shares cadence even when beneficiary is an owner", () => {
  const state = withFallbackAdminUserInStateForm(form(), KEY);
  const datum = stateFormToDatum(state);
  datum.fields[5] = {alternative: 0, fields: [EARLIEST - 1_799_999]};
  assert.throws(() => stop(datum), /30-minute/);
  datum.fields[5] = {alternative: 0, fields: [EARLIEST - 1_800_000]};
  assert.doesNotThrow(() => stop(datum));
  assert.throws(() => stop(undefined, {txLatestTimeMs: EARLIEST + 3_600_001}), /one hour|60 minutes|1 hour|one-hour/);
});
test("pre-start stop keeps zero lifetime and rejects a cutoff below already paid total", () => {
  const state = form();state.streamingPayments[0]!.startDate = String(LATEST + 1000);
  state.streamingPayments[0]!.paidOutAmount = "0";
  const result = stop(stateFormToDatum(state));
  assert.equal(result.cutoff, BigInt(LATEST + 1000));assert.equal(result.retainedDebt, 0n);
  state.streamingPayments[0]!.paidOutAmount = "1";
  assert.throws(() => stop(stateFormToDatum(state)), /paid amount above/);
});
test("stop codec appends constructor 8 and requires both uint64 ids", () => {
  assert.deepEqual(resolveStructuredOnChainAction("stop-beneficiary-stream"), {kind:"stop-beneficiary-stream"});
  assert.deepEqual(buildSttSpendRedeemerData({kind:"stop-beneficiary-stream", beneficiaryId:9, streamingPaymentId:7}), {alternative:8,fields:[9,7]});
  assert.throws(() => buildSttSpendRedeemerData({kind:"stop-beneficiary-stream", beneficiaryId:9}), /requires beneficiary and streaming/);
  assert.throws(() => buildSttSpendRedeemerData({kind:"stop-beneficiary-stream", beneficiaryId:-1, streamingPaymentId:7}), /must be between/);
  assert.deepEqual(buildSttSpendRedeemerData({kind:"beneficiary-withdrawal",beneficiaryId:9}),{alternative:3,fields:[9]});
  assert.deepEqual(buildSttSpendRedeemerData({kind:"beneficiary-exit",beneficiaryId:9}),{alternative:7,fields:[9]});
});

test("stop rejects a second unlocked beneficiary signer but allows owner or same-beneficiary keys", () => {
  const state = form();
  const otherKey = "22".repeat(28);
  state.beneficiaries.push({...state.beneficiaries[0]!,id:"10",wallets:[otherKey]});
  assert.throws(() => stop(stateFormToDatum(state), {additionalSignerKeyHashes:[otherKey]}), /exactly one unlocked beneficiary/);
  assert.doesNotThrow(() => stop(stateFormToDatum(state), {additionalSignerKeyHashes:[KEY,"33".repeat(28)]}));
  state.beneficiaries[1]!.unlockAfterMode = "some";
  state.beneficiaries[1]!.unlockAfter = String(LATEST + 1);
  assert.doesNotThrow(() => stop(stateFormToDatum(state), {additionalSignerKeyHashes:[otherKey]}));
});
