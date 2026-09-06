import assert from "node:assert/strict";
import test from "node:test";
import { omittedDiscoveredInputCount } from "./beneficiary-exit-review";

const first = { txHash: "aa".repeat(32), outputIndex: 0 };
const second = { ...first, outputIndex: 1 };

test("counts discovered funds omitted from actual transaction inputs", () => {
  assert.equal(omittedDiscoveredInputCount([first, second], [first]), 1);
  assert.equal(omittedDiscoveredInputCount([first, second], []), 2);
});

test("ignores external transaction inputs and compares complete normalized references", () => {
  const external = { txHash: "bb".repeat(32), outputIndex: 0 };
  assert.equal(omittedDiscoveredInputCount([first], [external]), 1);
  assert.equal(omittedDiscoveredInputCount([first], [{ ...first, txHash: first.txHash.toUpperCase() }, external]), 0);
});

test("duplicate discovery rows do not inflate the omitted count", () => {
  assert.equal(omittedDiscoveredInputCount([first, first, second], [second]), 1);
});
