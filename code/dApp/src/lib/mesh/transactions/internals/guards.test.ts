import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertRecordPayload,
  assertValidAssetList,
  assertValidConstrData,
  assertValidOptionalConstrData,
  assertValidPayoutTransfers,
  assertValidWalletInputRefs,
  assertValidWalletOutputs,
  assertWalletValuesHaveAtMostNativeAssets,
  validateForwardedStateDatum
} from "@/lib/mesh/transactions/internals/guards";
import {
  createDefaultStateForm,
  createDefaultUserFormState,
  stateFormToDatum
} from "@/lib/contracts/state-form";

// These guards are the first line of defence against malformed builder input on
// the fund-moving path: every builder calls them and they throw on bad shapes.
// They were previously untested; these cases pin the accept/reject boundary.

const CONSTR = { alternative: 0, fields: [] };
const TX_HASH = "a".repeat(64);
// addr(_test)?1[0-9a-z]+, the off-chain output-address shape the guard accepts.
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

test("assertValidWalletInputRefs enforces an optional transaction input cap", () => {
  const inputs = [
    { txHash: TX_HASH, outputIndex: 0 },
    { txHash: "b".repeat(64), outputIndex: 1 }
  ];

  assert.doesNotThrow(() => assertValidWalletInputRefs(inputs, "Inputs", 2));
  assert.throws(
    () => assertValidWalletInputRefs(inputs, "Inputs", 1),
    /Inputs can include at most 1 wallet script input/
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

test("bounded wallet values allow a five-asset union across one side", () => {
  const fiveNativeAssets = Array.from({ length: 5 }, (_, index) => ({
    unit: `${(index + 10).toString(16).padStart(56, "0")}01`,
    quantity: "1"
  }));

  assert.doesNotThrow(() =>
    assertWalletValuesHaveAtMostNativeAssets([
      [{ unit: "lovelace", quantity: "2000000" }, ...fiveNativeAssets.slice(0, 3)],
      fiveNativeAssets.slice(3)
    ], "Wallet inputs")
  );
  assert.throws(
    () =>
      assertWalletValuesHaveAtMostNativeAssets([
        fiveNativeAssets,
        [{ unit: "ff".repeat(28), quantity: "1" }]
      ], "Wallet inputs"),
    /Wallet inputs contain 6 distinct native assets in total.*limit is 5/
  );
});

test("bounded wallet values ignore zero entries and duplicate native units", () => {
  const sixEntries = Array.from({ length: 6 }, (_, index) => ({
    unit: `${(index + 10).toString(16).padStart(56, "0")}01`,
    quantity: index === 5 ? "0" : "1"
  }));

  assert.doesNotThrow(() =>
    assertWalletValuesHaveAtMostNativeAssets([
      sixEntries,
      [{ ...sixEntries[0]!, unit: sixEntries[0]!.unit.toUpperCase() }]
    ], "Wallet outputs")
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

test("forwarded State validation accepts six fields and rejects every other readable length", () => {
  const sixFieldState = stateFormToDatum({
    ...createDefaultStateForm(),
    users: [
      {
        ...createDefaultUserFormState("0"),
        wallets: ["aa".repeat(28)],
        isAdmin: true,
        canRenewProofOfLife: true,
        preset: "admin"
      }
    ]
  });
  const sevenFieldState = {
    ...sixFieldState,
    fields: [...sixFieldState.fields, { alternative: 1, fields: [] }]
  };
  const legacyStates = [
    { ...sixFieldState, fields: sixFieldState.fields.slice(0, 4) },
    { ...sixFieldState, fields: sixFieldState.fields.slice(0, 5) }
  ];
  const action = {
    kind: "operator" as const,
    operatorPath: "admin" as const,
    operatorIntent: "use" as const
  };

  assert.doesNotThrow(() =>
    validateForwardedStateDatum(sixFieldState, action, "test", "Invalid State.")
  );
  legacyStates.forEach((legacyState) => {
    assert.throws(
      () => validateForwardedStateDatum(legacyState, action, "test", "Invalid State."),
      /exactly six fields/
    );
  });
  assert.throws(
    () => validateForwardedStateDatum(sevenFieldState, action, "test", "Invalid State."),
    /exactly six fields/
  );
});
