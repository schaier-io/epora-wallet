import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import type { ConstrData } from "@/lib/types/contracts";
import { getFreshStreamingAssetUnits, getMissingStreamingAssetUnits } from "./streaming-asset-proof";

const POLICY = "ab".repeat(28);
const NAME = "deadbeef";
const UNIT = POLICY + NAME;

function stream(id: number | bigint, policy = POLICY, name = NAME): ConstrData {
  return { alternative: 0, fields: [id, { alternative: 0, fields: [] }, 0, policy, name, 1, 0, 1] };
}

function state(...streams: ConstrData[]): ConstrData {
  const datum = stateFormToDatum(createDefaultStateForm());
  return { ...datum, fields: [datum.fields[0]!, datum.fields[1]!, streams, ...datum.fields.slice(3)] };
}

test("mint requires every distinct stream asset, including ADA and empty token names", () => {
  assert.deepEqual(getFreshStreamingAssetUnits(state(stream(1), stream(2), stream(3, "", ""), stream(4, POLICY, ""))),
    [UNIT, "lovelace", POLICY]);
});

test("manage requires only new IDs and compares integer IDs without precision loss", () => {
  const existing = stream(9_007_199_254_740_993n);
  const output = state(existing, stream(2, "cd".repeat(28), ""));
  assert.deepEqual(getFreshStreamingAssetUnits(output, state(existing)), ["cd".repeat(28)]);
  assert.deepEqual(getFreshStreamingAssetUnits(state(stream(1n)), state(stream(1))), []);
});

test("existing stream edits need no asset proof", () => {
  const existing = stream(1);
  const changed = { ...existing, fields: [...existing.fields.slice(0, 7), 2] };
  assert.deepEqual(getFreshStreamingAssetUnits(state(changed), state(existing)), []);
});

test("hexadecimal case changes identify the same asset", () => {
  assert.deepEqual(getFreshStreamingAssetUnits(state(stream(1, POLICY.toUpperCase(), NAME.toUpperCase()), stream(2))), [UNIT]);
  assert.deepEqual(getMissingStreamingAssetUnits([UNIT.toUpperCase(), UNIT], [{ unit: UNIT, quantity: "1" }]), []);
});

test("one exact unit proves all fresh streams of that asset", () => {
  assert.deepEqual(getMissingStreamingAssetUnits([UNIT, UNIT, "lovelace"], [{ unit: UNIT, quantity: "1" }]), ["lovelace"]);
  assert.deepEqual(getMissingStreamingAssetUnits([UNIT], [{ unit: UNIT, quantity: "0" }]), [UNIT]);
  assert.deepEqual(getMissingStreamingAssetUnits([UNIT], []), [UNIT]);
});

test("another policy or asset name cannot prove the requested asset", () => {
  assert.deepEqual(getMissingStreamingAssetUnits([UNIT], [
    { unit: "cd".repeat(28) + NAME, quantity: "100" },
    { unit: POLICY + "deadcafe", quantity: "100" }
  ]), [UNIT]);
});

test("malformed quantities fail instead of becoming proof", () => {
  for (const quantity of ["", "-1", "1.5", " 1 ", "0x1"]) {
    assert.throws(() => getMissingStreamingAssetUnits([UNIT], [{ unit: UNIT, quantity }]), /quantity/i);
  }
  assert.throws(() => getMissingStreamingAssetUnits([UNIT], [{ unit: UNIT, quantity: 1 as unknown as string }]), /quantity/i);
});

test("malformed stream records cannot hide required assets", () => {
  assert.throws(() => getFreshStreamingAssetUnits(state({ alternative: 0, fields: [] })), /stream/i);
  assert.throws(() => getFreshStreamingAssetUnits(state(stream(1, "aa", NAME))), /policy/i);
  assert.throws(() => getFreshStreamingAssetUnits(state(stream(1)), state({ alternative: 0, fields: [] })), /stream/i);
});
