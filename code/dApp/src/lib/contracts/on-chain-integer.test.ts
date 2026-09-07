import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNonNegativeUint64,
  isNonNegativeUint64Decimal,
  MAX_ON_CHAIN_STATE_INTEGER
} from "@/lib/contracts/on-chain-integer";

test("uint64 boundary accepts zero and the exact maximum", () => {
  assert.doesNotThrow(() => assertNonNegativeUint64(0n, "Value"));
  assert.doesNotThrow(() =>
    assertNonNegativeUint64(MAX_ON_CHAIN_STATE_INTEGER, "Value")
  );
});

test("uint64 boundary rejects negative and maximum plus one", () => {
  assert.throws(() => assertNonNegativeUint64(-1n, "Value"), /between 0 and/);
  assert.throws(
    () => assertNonNegativeUint64(MAX_ON_CHAIN_STATE_INTEGER + 1n, "Value"),
    /between 0 and/
  );
});

test("uint64 decimal boundary rejects oversized text before BigInt parsing", () => {
  assert.equal(isNonNegativeUint64Decimal(MAX_ON_CHAIN_STATE_INTEGER.toString()), true);
  assert.equal(
    isNonNegativeUint64Decimal((MAX_ON_CHAIN_STATE_INTEGER + 1n).toString()),
    false
  );
  assert.equal(isNonNegativeUint64Decimal("9".repeat(100_000)), false);
});
