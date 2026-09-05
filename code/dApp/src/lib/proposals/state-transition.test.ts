import assert from "node:assert/strict";
import test from "node:test";
import { MeshTxBuilder, serializeData, type UTxO } from "@meshsdk/core";
import { deserializeTx } from "@meshsdk/core-cst";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import type { ConstrData } from "@/lib/types/contracts";
import { validateCurrentStateDatum } from "@/lib/contracts/state-validation";
import { compareStates, reviewStateTransition } from "./state-transition";
import { verifyProposal } from "./verify";
import { resolveProposalBodyHash, serializeJsonSafe } from "./serialization";
import type { ProposalBuildContext, ProposalDetailDto } from "./types";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const WALLET_UNIT = `${"ab".repeat(28)}01`;
const INPUT_HASH = "aa".repeat(32);

function state(): ConstrData {
  const form = createDefaultStateForm();
  form.proofOfLifeUnlockTimeMode = "some";
  form.proofOfLifeUnlockTime = "100";
  form.proofOfLifeIncrementMode = "some";
  form.proofOfLifeIncrement = "1000";
  form.users = [{
    id: "0", wallets: ["11".repeat(28)], perDayAllowance: [], remainingAllowance: [],
    nextAllowanceReset: "0", canRenewProofOfLife: true, multiSigPowerMode: "some",
    multiSigPower: "1", isAdmin: true, preset: "admin"
  }];
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = "1";
  return stateFormToDatum(form);
}

function stateInput(datum = state()): UTxO {
  return {
    input: { txHash: INPUT_HASH, outputIndex: 0 },
    output: {
      address: ADDRESS,
      amount: [{ unit: "lovelace", quantity: "10000000" }, { unit: WALLET_UNIT, quantity: "1" }],
      plutusData: serializeData(datum)
    }
  };
}

function transaction(datum: ConstrData | null = state(), unit = WALLET_UNIT): string {
  const builder = new MeshTxBuilder();
  builder.txIn(INPUT_HASH, 0, stateInput().output.amount, ADDRESS)
    .txOut(ADDRESS, [{ unit: "lovelace", quantity: "10000000" }, { unit, quantity: "1" }]);
  if (datum) builder.txOutInlineDatumValue(datum);
  builder.requiredSignerHash("11".repeat(28));
  return builder.completeSync();
}

test("State comparison includes a raw renewal flag even when its user is an admin", () => {
  const before = state();
  const after = structuredClone(before);
  const access = after.fields[0] as ConstrData;
  const user = (access.fields[0] as ConstrData[])[0]!;
  user.fields[5] = { alternative: 0, fields: [] };
  assert.deepEqual(compareStates(before, after), [{
    path: "state.access.users[0].can_renew_proof_of_life", before: "true", after: "false"
  }]);
});

test("State comparison preserves integer precision and includes the cadence field", () => {
  const before = state();
  const after = structuredClone(before);
  before.fields[5] = { alternative: 0, fields: [9_007_199_254_740_992n] };
  after.fields[5] = { alternative: 0, fields: [9_007_199_254_740_993n] };
  assert.deepEqual(compareStates(before, after), [{
    path: "state.last_non_admin_payout_at.some", before: "9007199254740992", after: "9007199254740993"
  }]);
});

test("State comparison fails closed for unknown or legacy fields", () => {
  const before = state();
  for (const fields of [before.fields.slice(0, 5), [...before.fields, 0]]) {
    assert.throws(() => compareStates(before, { alternative: 0, fields }));
  }
});

test("State comparison shows each field of an added beneficiary and its removal", () => {
  const before = state();
  const after = structuredClone(before);
  (after.fields[0] as ConstrData).fields[2] = [{
    alternative: 0,
    fields: [1, ["22".repeat(28)], { alternative: 1, fields: [] }, 3]
  }];
  const validation = validateCurrentStateDatum(after);
  assert.deepEqual(validation, []);
  const additions = compareStates(before, after);
  assert.ok(additions.some((change) => change.path.endsWith(".weight") && change.after === "3"));
  assert.ok(additions.some((change) => change.path.endsWith(".beneficiary_wallets[0]") && change.after === `0x${"22".repeat(28)}`));
  const removals = compareStates(after, before);
  for (const change of additions) {
    assert.deepEqual(removals.find((entry) => entry.path === change.path), {
      ...change, before: change.after, after: change.before
    });
  }
});

test("review reads the continuing inline State and binds its transaction hash", () => {
  const before = state();
  const after = structuredClone(before);
  after.fields[3] = Buffer.from("Updated wallet").toString("hex");
  const result = reviewStateTransition({ unsignedTxHex: transaction(after), walletUnit: WALLET_UNIT, stateInput: stateInput(before) });
  assert.equal(result.txBodyHash.length, 64);
  assert.equal(result.outputIndex, 0);
  assert.ok(result.changes.some((change) => change.path === "state.wallet_name.text" && change.after === "Updated wallet"));
});

test("review rejects an output without its inline State or exact token", () => {
  for (const unsignedTxHex of [transaction(null), transaction(state(), `${"cd".repeat(28)}01`)]) {
    assert.throws(() => reviewStateTransition({ unsignedTxHex, walletUnit: WALLET_UNIT, stateInput: stateInput() }));
  }
});

test("review confirms every State field is unchanged for unchanged output data", () => {
  assert.deepEqual(reviewStateTransition({ unsignedTxHex: transaction(), walletUnit: WALLET_UNIT, stateInput: stateInput() }).changes, []);
});

// A local serialization fixture, never submitted or evaluated on a network.
// The existing RunOperator(Multisig, Use) redeemer supplies the action binding.
const USE_TX = "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d8799fd8799fd87a80d87980ffff820101f5f6";

test("full proposal verification requires a decoded continuing State even with live inputs and valid signer authority", async (t) => {
  const get = t.mock.method(ServerFetcher.prototype, "get", async () => ({
    outputs: [{ output_index: 0, consumed_by_tx: null }]
  }));
  t.mock.method(ServerFetcher.prototype, "fetchUTxOs", async () => [stateInput()]);
  const context = {
    builder: "stt-spend", mode: "use",
    config: { walletPolicyId: WALLET_UNIT.slice(0, 56), walletAssetNameHex: "01" },
    input: { sttInputTxHash: INPUT_HASH, sttInputOutputIndex: 0, authorityPath: "multisig" }
  } as ProposalBuildContext;
  for (const datum of [null, state()]) {
    const tx = deserializeTx(transaction(datum));
    tx.setWitnessSet(deserializeTx(USE_TX).witnessSet());
    const unsignedTxHex = tx.toCbor() as string;
    const proposal: ProposalDetailDto = {
      id: "local-review", walletUnit: WALLET_UNIT, walletPolicyId: WALLET_UNIT.slice(0, 56),
      title: "Local State review", description: null, actionKind: "use", authorityPath: "multisig",
      status: "OPEN", txBodyHash: resolveProposalBodyHash(unsignedTxHex), submittedTxHash: null,
      createdByKeyHash: "11".repeat(28), createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
      signatureCount: 0, signerKeyHashes: [], unsignedTxHex, buildContextJson: serializeJsonSafe(context),
      summaryJson: null, signatures: []
    };
    const result = await verifyProposal(proposal);
    assert.ok(result.signers);
    assert.ok(result.effect.inputs.every((input) => input.live));
    assert.equal(result.validity, datum ? "valid" : "invalid");
    assert.equal(result.stateTransition?.txBodyHash ?? null, datum ? proposal.txBodyHash : null);
  }
  assert.equal(get.mock.callCount(), 2);
});
