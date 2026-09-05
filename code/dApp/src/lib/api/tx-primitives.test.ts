import assert from "node:assert/strict";
import test from "node:test";
import { serializeData } from "@meshsdk/core";
import {
  ConstrDataSchema,
  OnChainUint64Schema,
  QuantitySchema,
  stringifyTxRequestBody
} from "@/lib/api/tx-primitives";
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

test("constructor data parses exact uint64 wrappers without treating strings as integers", () => {
  const parsed = ConstrDataSchema.parse({
    alternative: 0,
    fields: [
      { int: MAX_ON_CHAIN_STATE_INTEGER.toString() },
      42,
      MAX_ON_CHAIN_STATE_INTEGER.toString()
    ]
  });

  assert.deepEqual(parsed, {
    alternative: 0,
    fields: [MAX_ON_CHAIN_STATE_INTEGER, 42, MAX_ON_CHAIN_STATE_INTEGER.toString()]
  });
});

test("transaction request JSON wraps bigint and round-trips it through the schema", () => {
  const body = stringifyTxRequestBody({
    alternative: 0,
    fields: [MAX_ON_CHAIN_STATE_INTEGER]
  });
  assert.equal(
    body,
    `{"alternative":0,"fields":[{"int":"${MAX_ON_CHAIN_STATE_INTEGER.toString()}"}]}`
  );

  const parsed = ConstrDataSchema.parse(JSON.parse(body));
  assert.equal(parsed.fields[0], MAX_ON_CHAIN_STATE_INTEGER);
});

test("opaque Plutus data accepts signed integers within the uint64 magnitude", () => {
  const negativeMaximum = -MAX_ON_CHAIN_STATE_INTEGER;
  const body = stringifyTxRequestBody({
    alternative: 0,
    fields: [-1n, negativeMaximum]
  });
  const parsed = ConstrDataSchema.parse(JSON.parse(body));

  assert.deepEqual(parsed.fields, [-1n, negativeMaximum]);
  assert.equal(
    serializeData(ConstrDataSchema.parse({ alternative: 0, fields: [-1] }), "Mesh"),
    "d8799f20ff"
  );
});

test("explicit Epora uint64 values remain non-negative", () => {
  assert.equal(OnChainUint64Schema.safeParse(-1).success, false);
});

test("constructor data rejects imprecise numbers and wrappers above the magnitude cap", () => {
  assert.equal(
    ConstrDataSchema.safeParse({
      alternative: 0,
      fields: [Number.MAX_SAFE_INTEGER + 1]
    }).success,
    false
  );
  assert.equal(
    ConstrDataSchema.safeParse({
      alternative: 0,
      fields: [{ int: (MAX_ON_CHAIN_STATE_INTEGER + 1n).toString() }]
    }).success,
    false
  );
  assert.equal(
    ConstrDataSchema.safeParse({
      alternative: 0,
      fields: [{ int: (-MAX_ON_CHAIN_STATE_INTEGER - 1n).toString() }]
    }).success,
    false
  );
});
