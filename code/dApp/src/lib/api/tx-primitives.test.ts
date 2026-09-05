import assert from "node:assert/strict";
import test from "node:test";
import { QuantitySchema } from "@/lib/api/tx-primitives";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";

test("quantity schema accepts the uint64 maximum", () => {
  assert.equal(
    QuantitySchema.safeParse(MAX_ON_CHAIN_STATE_INTEGER.toString()).success,
    true
  );
});

test("quantity schema rejects uint64 maximum plus one", () => {
  assert.equal(
    QuantitySchema.safeParse((MAX_ON_CHAIN_STATE_INTEGER + 1n).toString()).success,
    false
  );
});

test("invalid quantity text returns schema errors instead of throwing", () => {
  for (const quantity of ["abc", "1.5", "9".repeat(100_000)]) {
    assert.doesNotThrow(() => {
      assert.equal(QuantitySchema.safeParse(quantity).success, false);
    });
  }
});
