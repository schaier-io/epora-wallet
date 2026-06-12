import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperatorPathData,
  buildStateActionData,
  buildSttSpendRedeemerData,
  buildWalletSpendRedeemerData,
  buildWalletWitnessData,
  resolveOperatorOnChainAction,
  resolveStructuredOnChainAction
} from "@/lib/contracts/action-data";

// These on-chain `alternative` numbers ARE the contract interface: the STT
// validator decodes the redeemer by constructor index, so an off-by-one here
// silently builds a transaction the script rejects (or, worse, authorizes the
// wrong action). Pin them down.

// --- buildOperatorPathData ---------------------------------------------------

test("operator path encodes admin=0, multisig=1", () => {
  assert.deepEqual(buildOperatorPathData("admin"), { alternative: 0, fields: [] });
  assert.deepEqual(buildOperatorPathData("multisig"), { alternative: 1, fields: [] });
  assert.deepEqual(buildOperatorPathData(), { alternative: 0, fields: [] });
});

// --- buildSttSpendRedeemerData: RunOperator (alt 0) --------------------------

test("RunOperator encodes intent use=0, update-state=1, manage=2", () => {
  const intents = [
    ["use", 0],
    ["update-state", 1],
    ["manage-streaming-payments", 2]
  ] as const;

  for (const [operatorIntent, expectedIntentAlt] of intents) {
    assert.deepEqual(
      buildSttSpendRedeemerData({ kind: "operator", operatorPath: "admin", operatorIntent }),
      {
        alternative: 0,
        fields: [
          {
            alternative: 0,
            fields: [
              { alternative: 0, fields: [] },
              { alternative: expectedIntentAlt, fields: [] }
            ]
          }
        ]
      }
    );
  }
});

test("RunOperator threads the multisig path into the operator action", () => {
  const redeemer = buildSttSpendRedeemerData({
    kind: "operator",
    operatorPath: "multisig",
    operatorIntent: "use"
  });
  assert.deepEqual(redeemer.fields[0], {
    alternative: 0,
    fields: [
      { alternative: 1, fields: [] },
      { alternative: 0, fields: [] }
    ]
  });
});

// --- buildSttSpendRedeemerData: other variants ------------------------------

test("RenewProofOfLife is the bare alt-1 constructor", () => {
  assert.deepEqual(buildSttSpendRedeemerData({ kind: "proof-of-life-renewal" }), {
    alternative: 1,
    fields: []
  });
});

test("UseAllowance (alt 2) carries the spent-allowance asset entries", () => {
  assert.deepEqual(
    buildSttSpendRedeemerData({
      kind: "allowance-withdrawal",
      spentAllowance: [{ unit: "lovelace", quantity: "5" }]
    }),
    { alternative: 2, fields: [[{ alternative: 0, fields: ["", "", 5] }]] }
  );
  // Missing payload encodes an empty entry list (the builder fills it in later).
  assert.deepEqual(buildSttSpendRedeemerData({ kind: "allowance-withdrawal" }), {
    alternative: 2,
    fields: [[]]
  });
});

test("UseBeneficiary (alt 3) carries the beneficiary id, defaulting to 0", () => {
  assert.deepEqual(buildSttSpendRedeemerData({ kind: "beneficiary-withdrawal", beneficiaryId: 7 }), {
    alternative: 3,
    fields: [7]
  });
  assert.deepEqual(buildSttSpendRedeemerData({ kind: "beneficiary-withdrawal" }), {
    alternative: 3,
    fields: [0]
  });
});

test("PayStreamingPayment (alt 4) carries the payout-delta entries", () => {
  const unit = `${"aa".repeat(28)}cafe`;
  assert.deepEqual(
    buildSttSpendRedeemerData({
      kind: "streaming-payment-payout",
      payoutDelta: [{ unit, quantity: "3" }]
    }),
    { alternative: 4, fields: [[{ alternative: 0, fields: ["aa".repeat(28), "cafe", 3] }]] }
  );
});

test("Consolidate (alt 5) encodes admin=0, multisig=1, beneficiary=2", () => {
  assert.deepEqual(buildSttSpendRedeemerData({ kind: "consolidate", consolidatePath: "admin" }), {
    alternative: 5,
    fields: [{ alternative: 0, fields: [] }]
  });
  assert.deepEqual(buildSttSpendRedeemerData({ kind: "consolidate", consolidatePath: "multisig" }), {
    alternative: 5,
    fields: [{ alternative: 1, fields: [] }]
  });
  assert.deepEqual(
    buildSttSpendRedeemerData({ kind: "consolidate", consolidatePath: "beneficiary" }),
    { alternative: 5, fields: [{ alternative: 2, fields: [] }] }
  );
});

// --- RunOperator sub-actions: remove-access-index / set-stake-credential -----

test("RemoveAccessIndex wraps a user/beneficiary index target (op-kind alt 3)", () => {
  const userRemoval = buildSttSpendRedeemerData({
    kind: "remove-access-index",
    operatorPath: "admin",
    target: { list: "user", index: 2 }
  });
  assert.deepEqual(userRemoval, {
    alternative: 0,
    fields: [
      {
        alternative: 0,
        fields: [
          { alternative: 0, fields: [] },
          { alternative: 3, fields: [{ alternative: 0, fields: [2] }] }
        ]
      }
    ]
  });

  const beneficiaryRemoval = buildSttSpendRedeemerData({
    kind: "remove-access-index",
    operatorPath: "admin",
    target: { list: "beneficiary", index: 4 }
  });
  // Beneficiary target switches the inner index constructor to alt 1.
  assert.deepEqual(
    (beneficiaryRemoval.fields[0] as { fields: unknown[] }).fields[1],
    { alternative: 3, fields: [{ alternative: 1, fields: [4] }] }
  );
});

test("SetIntendedStakeCredential (op-kind alt 4) encodes the Option<Credential>", () => {
  const none = buildSttSpendRedeemerData({
    kind: "set-intended-stake-credential",
    operatorPath: "admin",
    stakeCredential: { kind: "none" }
  });
  assert.deepEqual((none.fields[0] as { fields: unknown[] }).fields[1], {
    alternative: 4,
    fields: [{ alternative: 1, fields: [] }]
  });

  const key = buildSttSpendRedeemerData({
    kind: "set-intended-stake-credential",
    operatorPath: "admin",
    stakeCredential: { kind: "key", hashHex: "aa" }
  });
  assert.deepEqual((key.fields[0] as { fields: unknown[] }).fields[1], {
    alternative: 4,
    fields: [{ alternative: 0, fields: [{ alternative: 0, fields: ["aa"] }] }]
  });

  const script = buildSttSpendRedeemerData({
    kind: "set-intended-stake-credential",
    operatorPath: "admin",
    stakeCredential: { kind: "script", hashHex: "bb" }
  });
  assert.deepEqual((script.fields[0] as { fields: unknown[] }).fields[1], {
    alternative: 4,
    fields: [{ alternative: 0, fields: [{ alternative: 1, fields: ["bb"] }] }]
  });
});

// --- compatibility shims -----------------------------------------------------

test("witness / state-action / wallet-spend shims all emit the zero-arity constructor", () => {
  const zeroArity = { alternative: 0, fields: [] };
  assert.deepEqual(buildWalletWitnessData("mint"), zeroArity);
  assert.deepEqual(buildStateActionData("mint"), zeroArity);
  assert.deepEqual(buildWalletSpendRedeemerData(), zeroArity);
});

// --- resolveStructuredOnChainAction -----------------------------------------

test("resolveStructuredOnChainAction maps UI actions to structured actions", () => {
  assert.deepEqual(resolveStructuredOnChainAction("renew-proof-of-life"), {
    kind: "proof-of-life-renewal"
  });
  assert.deepEqual(resolveStructuredOnChainAction("use-allowance"), {
    kind: "allowance-withdrawal"
  });
  assert.deepEqual(resolveStructuredOnChainAction("use-beneficiary"), {
    kind: "beneficiary-withdrawal"
  });
  assert.deepEqual(resolveStructuredOnChainAction("payout-streaming-payment"), {
    kind: "streaming-payment-payout"
  });
});

test("operator intents resolve the authority path (multisig vs admin default)", () => {
  assert.deepEqual(resolveStructuredOnChainAction("use", "multisig"), {
    kind: "operator",
    operatorPath: "multisig",
    operatorIntent: "use"
  });
  assert.deepEqual(resolveStructuredOnChainAction("update-state"), {
    kind: "operator",
    operatorPath: "admin",
    operatorIntent: "update-state"
  });
  assert.deepEqual(resolveStructuredOnChainAction("manage-streaming-payments", "multisig"), {
    kind: "operator",
    operatorPath: "multisig",
    operatorIntent: "manage-streaming-payments"
  });
});

test("consolidate resolves admin / multisig / beneficiary paths", () => {
  assert.equal(
    (resolveStructuredOnChainAction("consolidate-utxo", "beneficiary") as { consolidatePath: string })
      .consolidatePath,
    "beneficiary"
  );
  assert.equal(
    (resolveStructuredOnChainAction("consolidate-utxo", "multisig") as { consolidatePath: string })
      .consolidatePath,
    "multisig"
  );
  assert.equal(
    (resolveStructuredOnChainAction("consolidate-utxo") as { consolidatePath: string }).consolidatePath,
    "admin"
  );
});

test("resolveOperatorOnChainAction defaults to admin/use and honours multisig", () => {
  assert.deepEqual(resolveOperatorOnChainAction(), {
    kind: "operator",
    operatorPath: "admin",
    operatorIntent: "use"
  });
  assert.deepEqual(resolveOperatorOnChainAction("multisig"), {
    kind: "operator",
    operatorPath: "multisig",
    operatorIntent: "use"
  });
});
