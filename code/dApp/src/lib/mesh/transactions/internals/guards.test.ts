import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRecordPayload,
  assertValidAssetList,
  assertValidConstrData,
  assertValidOptionalConstrData,
  assertValidPayoutTransfers,
  assertValidWalletInputRefs,
  assertValidWalletOutputs,
  isConstrData,
  isRecord
} from "@/lib/mesh/transactions/internals/guards";

const TX_HASH = "ab".repeat(32); // 64 hex chars
const ADDRESS = "addr_test1qpfakepermissionwalletdemoaddress000000000000000000000000000000000000";
const ASSETS = [{ unit: "lovelace", quantity: "1000000" }];

test("isRecord distinguishes plain objects from primitives and null", () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord([]), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord("x"), false);
  assert.equal(isRecord(3), false);
});

test("isConstrData requires numeric alternative and array fields", () => {
  assert.equal(isConstrData({ alternative: 0, fields: [] }), true);
  assert.equal(isConstrData({ alternative: "0", fields: [] }), false);
  assert.equal(isConstrData({ alternative: 0, fields: {} }), false);
  assert.equal(isConstrData(null), false);
});

test("assertValidConstrData throws for non-Constr values", () => {
  assert.doesNotThrow(() => assertValidConstrData({ alternative: 1, fields: [] }, "x"));
  assert.throws(() => assertValidConstrData("nope", "State"), /State must be a Constr/);
  assert.throws(() => assertValidConstrData(undefined, "State"), /State must be a Constr/);
});

test("assertValidOptionalConstrData allows undefined but validates when present", () => {
  assert.doesNotThrow(() => assertValidOptionalConstrData(undefined, "x"));
  assert.doesNotThrow(() => assertValidOptionalConstrData({ alternative: 0, fields: [] }, "x"));
  assert.throws(() => assertValidOptionalConstrData("nope", "Datum"), /Datum must be a Constr/);
});

test("assertValidAssetList accepts a well-formed asset list", () => {
  assert.doesNotThrow(() => assertValidAssetList(ASSETS, "amount"));
});

test("assertValidAssetList rejects malformed asset lists", () => {
  assert.throws(() => assertValidAssetList("nope", "amount"), /must be an array/);
  assert.throws(() => assertValidAssetList([{ unit: "x" }], "amount"), /string "unit" and "quantity"/);
  assert.throws(
    () => assertValidAssetList([{ unit: "  ", quantity: "1" }], "amount"),
    /non-empty asset unit/
  );
  assert.throws(
    () => assertValidAssetList([{ unit: "lovelace", quantity: "1.5" }], "amount"),
    /quantity must be an integer string/
  );
  assert.throws(
    () => assertValidAssetList([{ unit: "lovelace", quantity: "-1" }], "amount"),
    /zero or greater/
  );
});

test("assertValidWalletInputRefs enforces hex txHash + non-negative integer index", () => {
  assert.doesNotThrow(() =>
    assertValidWalletInputRefs([{ txHash: TX_HASH, outputIndex: 0 }], "inputs")
  );
  assert.throws(() => assertValidWalletInputRefs("nope", "inputs"), /must be an array/);
  assert.throws(
    () => assertValidWalletInputRefs([{ txHash: "short", outputIndex: 0 }], "inputs"),
    /hex txHash/
  );
  assert.throws(
    () => assertValidWalletInputRefs([{ txHash: TX_HASH, outputIndex: -1 }], "inputs"),
    /non-negative integer outputIndex/
  );
  assert.throws(
    () => assertValidWalletInputRefs([{ txHash: TX_HASH, outputIndex: 1.5 }], "inputs"),
    /non-negative integer outputIndex/
  );
});

test("assertValidWalletOutputs validates each locking output's amount and datum", () => {
  assert.doesNotThrow(() =>
    assertValidWalletOutputs(
      [{ amount: ASSETS, inlineDatum: { alternative: 0, fields: [] } }],
      "outputs"
    )
  );
  // inlineDatum is optional
  assert.doesNotThrow(() => assertValidWalletOutputs([{ amount: ASSETS }], "outputs"));
  assert.throws(() => assertValidWalletOutputs("nope", "outputs"), /must be an array/);
  assert.throws(() => assertValidWalletOutputs([42], "outputs"), /must be an object/);
  assert.throws(
    () => assertValidWalletOutputs([{ amount: "nope" }], "outputs"),
    /must be an array/
  );
  assert.throws(
    () => assertValidWalletOutputs([{ amount: ASSETS, inlineDatum: "nope" }], "outputs"),
    /must be a Constr/
  );
});

test("assertValidPayoutTransfers requires a bech32 address per transfer", () => {
  assert.doesNotThrow(() =>
    assertValidPayoutTransfers([{ address: ADDRESS, amount: ASSETS }], "transfers")
  );
  assert.throws(() => assertValidPayoutTransfers("nope", "transfers"), /must be an array/);
  assert.throws(() => assertValidPayoutTransfers([1], "transfers"), /must be an object/);
  assert.throws(
    () => assertValidPayoutTransfers([{ address: "xyz", amount: ASSETS }], "transfers"),
    /Expected a bech32 Cardano address/
  );
});

test("assertValidPayoutTransfers flags a txHash mistaken for an address", () => {
  assert.throws(
    () => assertValidPayoutTransfers([{ address: TX_HASH, amount: ASSETS }], "transfers"),
    /looks like a transaction hash/
  );
});

test("assertRecordPayload narrows to a record and rejects non-objects", () => {
  assert.doesNotThrow(() => assertRecordPayload({ a: 1 }, "payload"));
  assert.throws(() => assertRecordPayload("nope", "payload"), /must be an object/);
  assert.throws(() => assertRecordPayload(null, "payload"), /must be an object/);
});
