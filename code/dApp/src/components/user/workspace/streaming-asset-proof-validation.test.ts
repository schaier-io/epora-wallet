import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import type { Asset, ConstrData } from "@/lib/types/contracts";
import { validateStreamingAssetProofDraft } from "./streaming-asset-proof-validation";

const POLICY = "ab".repeat(28);
const UNIT = POLICY + "deadbeef";

function state(): ConstrData {
  const empty = stateFormToDatum(createDefaultStateForm());
  const payment: ConstrData = { alternative: 0, fields: [1, { alternative: 0, fields: [] }, 0, POLICY, "deadbeef", 1, 0, 1] };
  return { ...empty, fields: [empty.fields[0]!, empty.fields[1]!, [payment], ...empty.fields.slice(3)] };
}

function loaded(assets: Asset[] = []) {
  return { assets, loading: false, error: null };
}

test("one loaded proof is enough when the other wallet lookup fails", () => {
  assert.deepEqual(validateStreamingAssetProofDraft(state(), [
    { ...loaded(), error: "offline" },
    loaded([{ unit: UNIT, quantity: "1" }])
  ]), []);
});

test("loading snapshots cannot establish either presence or absence", () => {
  const errors = validateStreamingAssetProofDraft(state(), [
    { ...loaded([{ unit: UNIT, quantity: "1" }]), loading: true }
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /Checking wallet funds/);
  assert.doesNotMatch(errors[0]!, /No loaded wallet holds/);
});

test("unknown and failed lookups report the next action", () => {
  assert.match(validateStreamingAssetProofDraft(state(), [])[0]!, /Wait for the balance/);
  assert.match(validateStreamingAssetProofDraft(state(), [{ ...loaded(), error: "offline" }])[0]!, /Refresh wallet funds/);
});

test("malformed loaded quantities report lookup failure, never a missing asset", () => {
  const errors = validateStreamingAssetProofDraft(state(), [loaded([{ unit: UNIT, quantity: "invalid" }])]);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /Could not check/);
});

test("existing streams remain editable while wallet lookups are unavailable", () => {
  assert.deepEqual(validateStreamingAssetProofDraft(state(), [], state()), []);
});

test("a missing exact asset names the policy and asset-name bytes", () => {
  const errors = validateStreamingAssetProofDraft(state(), [loaded([{ unit: POLICY + "00", quantity: "1" }])]);
  assert.equal(errors.length, 1);
  assert.ok(errors[0]!.includes(UNIT));
});
