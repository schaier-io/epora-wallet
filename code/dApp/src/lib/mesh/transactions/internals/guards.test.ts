import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertRecordPayload,
  assertValidAssetList,
  assertValidConstrData,
  assertValidOptionalConstrData,
  assertValidPayoutTransfers,
  assertValidWalletInputRefs,
  assertValidWalletOutputs
} from "@/lib/mesh/transactions/internals/guards";

// These guards are the first line of defence against malformed builder input on
// the fund-moving path — every builder calls them and they throw on bad shapes.
// They were previously untested; these cases pin the accept/reject boundary.

const CONSTR = { alternative: 0, fields: [] };
const TX_HASH = "a".repeat(64);
// addr(_test)?1[0-9a-z]+ — the off-chain output-address shape the guard accepts.
const ADDRESS = "addr_test1qq0testbeneficiaryaddress";

test("assertValidConstrData accepts a Constr-style object and rejects others", () => {
  assert.doesNotThrow(() => assertValidConstrData(CONSTR, "Datum"));
  assert.doesNotThrow(() => assertValidConstrData({ alternative: 3, fields: [1, "x"] }, "Datum"));
  assert.throws(() => assertValidConstrData({ fields: [] }, "Datum"), /Constr-style object/);
  assert.throws(() => assertValidConstrData({ alternative: 0 }, "Datum"), /Constr-style object/);
  assert.throws(() => assertValidConstrData({ alternative: "0", fields: [] }, "Datum"), /Constr-style object/);
  assert.throws(() => assertValidConstrData(null, "Datum"), /Datum must be a Constr-style/);
});

test("assertValidOptionalConstrData allows undefined but still validates a present value", () => {
  assert.doesNotThrow(() => assertValidOptionalConstrData(undefined, "Inline datum"));
  assert.doesNotThrow(() => assertValidOptionalConstrData(CONSTR, "Inline datum"));
  assert.throws(() => assertValidOptionalConstrData(null, "Inline datum"), /Constr-style object/);
  // null is not undefined, so it falls through to the Constr check and throws.
});

test("assertValidAssetList accepts well-formed assets including zero quantity", () => {
  assert.doesNotThrow(() =>
    assertValidAssetList(
      [
        { unit: "lovelace", quantity: "0" },
        { unit: `${"ab".repeat(28)}01`, quantity: "5" }
      ],
      "Amount"
    )
  );
});

test("assertValidAssetList rejects non-arrays and malformed entries", () => {
  assert.throws(() => assertValidAssetList({}, "Amount"), /must be an array of asset entries/);
  assert.throws(
    () => assertValidAssetList([{ unit: "lovelace" }], "Amount"),
    /entry 0 must include string "unit" and "quantity" fields/
  );
  assert.throws(
    () => assertValidAssetList([{ unit: "   ", quantity: "1" }], "Amount"),
    /entry 0 must include a non-empty asset unit/
  );
  assert.throws(
    () => assertValidAssetList([{ unit: "lovelace", quantity: "1.5" }], "Amount"),
    /entry 0 quantity must be an integer string/
  );
  assert.throws(
    () => assertValidAssetList([{ unit: "lovelace", quantity: "-1" }], "Amount"),
    /entry 0 quantity must be zero or greater/
  );
});

test("assertValidWalletInputRefs requires a hex txHash and non-negative integer index", () => {
  assert.doesNotThrow(() =>
    assertValidWalletInputRefs([{ txHash: TX_HASH, outputIndex: 0 }], "Inputs")
  );
  assert.throws(() => assertValidWalletInputRefs({}, "Inputs"), /must be an array/);
  assert.throws(
    () => assertValidWalletInputRefs([{ txHash: "nothex", outputIndex: 0 }], "Inputs"),
    /entry 0 must include a hex txHash/
  );
  assert.throws(
    () => assertValidWalletInputRefs([{ txHash: TX_HASH, outputIndex: -1 }], "Inputs"),
    /entry 0 must include a hex txHash/
  );
  assert.throws(
    () => assertValidWalletInputRefs([{ txHash: TX_HASH, outputIndex: 1.5 }], "Inputs"),
    /entry 0 must include a hex txHash/
  );
});

test("assertValidWalletOutputs validates the nested amount and optional inline datum", () => {
  assert.doesNotThrow(() =>
    assertValidWalletOutputs(
      [{ amount: [{ unit: "lovelace", quantity: "1000000" }], inlineDatum: CONSTR }],
      "Outputs"
    )
  );
  assert.doesNotThrow(() =>
    assertValidWalletOutputs([{ amount: [{ unit: "lovelace", quantity: "1" }] }], "Outputs")
  );
  assert.throws(() => assertValidWalletOutputs("nope", "Outputs"), /must be an array of locking-contract outputs/);
  assert.throws(
    () => assertValidWalletOutputs([{ amount: "bad" }], "Outputs"),
    /entry 0 amount must be an array of asset entries/
  );
  assert.throws(
    () => assertValidWalletOutputs([{ amount: [{ unit: "lovelace", quantity: "1" }], inlineDatum: { fields: [] } }], "Outputs"),
    /entry 0 inlineDatum must be a Constr-style/
  );
});

test("assertValidPayoutTransfers validates address, amount, and optional datum", () => {
  assert.doesNotThrow(() =>
    assertValidPayoutTransfers(
      [{ address: ADDRESS, amount: [{ unit: "lovelace", quantity: "1000000" }] }],
      "Transfers"
    )
  );
  assert.throws(() => assertValidPayoutTransfers({}, "Transfers"), /must be an array of transfer outputs/);
  assert.throws(
    () => assertValidPayoutTransfers([{ address: "not-an-address", amount: [] }], "Transfers"),
    /Expected a bech32 Cardano address/
  );
});

test("assertValidPayoutTransfers flags a txHash mistaken for an address", () => {
  assert.throws(
    () => assertValidPayoutTransfers([{ address: TX_HASH, amount: [] }], "Transfers"),
    /looks like a transaction hash/
  );
});

test("assertRecordPayload accepts objects and rejects primitives and null", () => {
  assert.doesNotThrow(() => assertRecordPayload({ a: 1 }, "Payload"));
  assert.throws(() => assertRecordPayload(null, "Payload"), /Payload must be an object/);
  assert.throws(() => assertRecordPayload("x", "Payload"), /Payload must be an object/);
  assert.throws(() => assertRecordPayload(42, "Payload"), /Payload must be an object/);
});
