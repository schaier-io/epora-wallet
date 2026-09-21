import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeData, type UTxO } from "@meshsdk/core";
import { createDefaultStateForm, createDefaultStreamingPaymentFormState, stateFormToDatum } from "@/lib/contracts/state-form";
import type { ConstrData } from "@/lib/types/contracts";
import { classifyActivityStateChange } from "./activity-state";
const STT = "ab".repeat(28) + "01";
const some = (value: number | bigint): ConstrData => ({ alternative: 0, fields: [value] });
function state(unlock: number | bigint = 100): ConstrData {
  const datum = stateFormToDatum(createDefaultStateForm());
  datum.fields[1] = { alternative: 0, fields: [some(unlock), some(10)] };
  return datum;
}
function utxo(datum?: ConstrData): UTxO {
  return { input: { txHash: "cd".repeat(32), outputIndex: 0 }, output: {
    address: "state-address", amount: [{ unit: STT, quantity: "1" }],
    ...(datum ? { plutusData: serializeData(datum, "Mesh") } : {}) } };
}
function classify(before: ConstrData, after: ConstrData) {
  return classifyActivityStateChange([utxo(before)], [utxo(after)], STT);
}
test("only a pure proof-of-life extension is check-in", () => {
  assert.equal(classify(state(100), state(110)), "check-in");
  assert.equal(classify(state(100), state(90)), "updated");
});
test("compares unlock times beyond Number precision", () => {
  const unlock = 9007199254740992n;
  assert.equal(classify(state(unlock), state(unlock + 1n)), "check-in");
  assert.equal(classify(state(unlock), state(unlock)), "updated");
});
test("configuration changes remain settings when unlock time also increases", () => {
  const renamed = state(110); renamed.fields[3] = "74657374";
  assert.equal(classify(state(), renamed), "settings");
  const increment = state(110); (increment.fields[1] as ConstrData).fields[1] = some(20);
  assert.equal(classify(state(), increment), "settings");
});
test("detects access and intended stake credential changes", () => {
  const access = state(); (access.fields[0] as ConstrData).fields[1] = some(1);
  assert.equal(classify(state(), access), "settings");
  const stake = state();
  stake.fields[4] = { alternative: 0, fields: [{ alternative: 0, fields: ["ab".repeat(28)] }] };
  assert.equal(classify(state(), stake), "settings");
});
test("missing, malformed and ambiguous state stays updated", () => {
  assert.equal(classifyActivityStateChange([], [utxo(state())], STT), "updated");
  assert.equal(classifyActivityStateChange([utxo()], [utxo(state())], STT), "updated");
  const malformed = utxo(); malformed.output.plutusData = "not-cbor";
  assert.equal(classifyActivityStateChange([malformed], [utxo(state())], STT), "updated");
  assert.equal(classify({ alternative: 0, fields: [] }, state()), "updated");
  const invalidStake = state();
  invalidStake.fields[4] = "00";
  assert.equal(classify(invalidStake, state(110)), "updated");
  assert.equal(classifyActivityStateChange([utxo(state()), utxo(state())], [utxo(state(110))], STT), "updated");
});
test("unchanged state and payout cadence changes stay updated", () => {
  assert.equal(classify(state(), state()), "updated");
  const paid = state(110); paid.fields[5] = some(100);
  assert.equal(classify(state(), paid), "updated");
});
test("stream changes stay neutral even when proof-of-life advances", () => {
  const before = state(); const after = state(110);
  const form = createDefaultStateForm();
  form.streamingPayments = [{ ...createDefaultStreamingPaymentFormState(),
    payoutAddress: "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6",
    amountPerDay: "1000000", startDate: "0", endDate: "86400000" }];
  before.fields[2] = stateFormToDatum(form).fields[2]!;
  after.fields[2] = before.fields[2];
  assert.equal(classify(before, after), "check-in");
  form.streamingPayments[0]!.paidOutAmount = "100";
  after.fields[2] = stateFormToDatum(form).fields[2]!;
  assert.equal(classify(before, after), "updated");
});
test("unknown extra field changes cannot become check-in", () => {
  const before = state(); const after = state(110);
  before.fields.push(0); after.fields.push(1);
  assert.equal(classify(before, after), "updated");
});

test("absent or malformed proof-of-life options remain neutral", () => {
  const absent = state();
  (absent.fields[1] as ConstrData).fields[0] = { alternative: 1, fields: [] };
  assert.equal(classify(absent, state(110)), "updated");
  const malformed = state();
  (malformed.fields[1] as ConstrData).fields[0] = "00";
  assert.equal(classify(malformed, state(110)), "updated");
});
