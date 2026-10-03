import assert from "node:assert/strict";
import test from "node:test";
import { MeshTxBuilder, serializeData, type UTxO } from "@meshsdk/core";
import { deserializeTx } from "@meshsdk/core-cst";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { resolveProposalBodyHash, serializeJsonSafe } from "./serialization";
import { verifyProposal } from "./verify";
import type { ProposalBuildContext, ProposalDetailDto } from "./types";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const POLICY = "ab".repeat(28);
const UNIT = `${POLICY}01`;
const STATE_HASH = "aa".repeat(32);
const REFERENCE_HASH = "bb".repeat(32);
const COLLATERAL_HASH = "cc".repeat(32);
const SIGNER = "11".repeat(28);
// Local serialization fixture supplies the RunOperator(Multisig, Use) redeemer.
const USE_TX = "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d8799fd8799fd87a80d87980ffff820101f5f6";

function fixture() {
  const form = createDefaultStateForm();
  form.users = [{ id: "0", wallets: [SIGNER], perDayAllowance: [], remainingAllowance: [],
    nextAllowanceReset: "0", canRenewProofOfLife: true, multiSigPowerMode: "some",
    multiSigPower: "1", isAdmin: true, preset: "admin" }];
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = "1";
  const datum = stateFormToDatum(form);
  const stateInput: UTxO = { input: { txHash: STATE_HASH, outputIndex: 0 }, output: {
    address: ADDRESS, amount: [{ unit: "lovelace", quantity: "10000000" }, { unit: UNIT, quantity: "1" }],
    plutusData: serializeData(datum)
  } };
  const builder = new MeshTxBuilder();
  builder.txIn(STATE_HASH, 0, stateInput.output.amount, ADDRESS)
    .readOnlyTxInReference(REFERENCE_HASH, 1)
    .txInCollateral(COLLATERAL_HASH, 2, [{ unit: "lovelace", quantity: "5000000" }], ADDRESS)
    .txOut(ADDRESS, stateInput.output.amount).txOutInlineDatumValue(datum).requiredSignerHash(SIGNER);
  const tx = deserializeTx(builder.completeSync());
  tx.setWitnessSet(deserializeTx(USE_TX).witnessSet());
  const unsignedTxHex = tx.toCbor() as string;
  const context = { builder: "stt-spend", mode: "use",
    config: { walletPolicyId: POLICY, walletAssetNameHex: "01" },
    input: { sttInputTxHash: STATE_HASH, sttInputOutputIndex: 0, authorityPath: "multisig" }
  } as ProposalBuildContext;
  const proposal: ProposalDetailDto = {
    id: "reference-liveness", walletUnit: UNIT, walletPolicyId: POLICY,
    title: "Local reference review", description: null, actionKind: "use", authorityPath: "multisig",
    status: "OPEN", txBodyHash: resolveProposalBodyHash(unsignedTxHex), submittedTxHash: null,
    createdByKeyHash: SIGNER, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    signatureCount: 0, signerKeyHashes: [], unsignedTxHex, buildContextJson: serializeJsonSafe(context),
    summaryJson: null, signatures: []
  };
  return { proposal, stateInput };
}

for (const [label, hash] of [["reference", REFERENCE_HASH], ["collateral", COLLATERAL_HASH]] as const) {
  for (const status of ["spent", "missing", "live"] as const) {
    test(`proposal checks ${status} ${label} without treating it as a consumed State input`, async (t) => {
      const { proposal, stateInput } = fixture();
      const lookedUp: string[] = [];
      t.mock.method(ServerFetcher.prototype, "get", async (path: string) => {
        lookedUp.push(path);
        const txHash = path.split("/")[1];
        const outputIndex = txHash === STATE_HASH ? 0 : txHash === REFERENCE_HASH ? 1 : 2;
        return { outputs: txHash === hash && status === "missing" ? [] : [{ output_index: outputIndex,
          consumed_by_tx: txHash === hash && status === "spent" ? "dd".repeat(32) : null }] };
      });
      t.mock.method(ServerFetcher.prototype, "fetchUTxOs", async () => [stateInput]);
      const result = await verifyProposal(proposal);
      assert.ok(lookedUp.includes(`txs/${hash}/utxos`));
      assert.equal(result.validity, status === "live" ? "valid" : "invalid");
      assert.deepEqual(result.effect.inputs.map(input => input.txHash), [STATE_HASH]);
      assert.equal(result.effect.inputs[0]!.isSttState, true);
      const dependency = label === "reference" ? result.effect.referenceInputs : result.effect.collateralInputs;
      assert.equal(dependency?.[0]?.txHash, hash);
      assert.equal(dependency?.[0]?.live, status === "missing" ? null : status === "live");
      assert.equal(dependency?.[0]?.isSttState, false);
      assert.equal(result.stateTransition?.txBodyHash, proposal.txBodyHash);
    });
  }
}

test("background budget includes reference and collateral inputs before making chain calls", async (t) => {
  const { proposal } = fixture();
  const get = t.mock.method(ServerFetcher.prototype, "get", async () => ({ outputs: [] }));
  const fetch = t.mock.method(ServerFetcher.prototype, "fetchUTxOs", async () => []);
  const result = await verifyProposal(proposal, { maxInputLookups: 2 });
  assert.equal(result.validity, "unknown");
  assert.equal(get.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test("a reference input cannot stand in for the consumed State input", async (t) => {
  const { proposal, stateInput } = fixture();
  const context = JSON.parse(proposal.buildContextJson!) as {
    input: { sttInputTxHash: string; sttInputOutputIndex: number }
  };
  context.input.sttInputTxHash = REFERENCE_HASH;
  context.input.sttInputOutputIndex = 1;
  proposal.buildContextJson = serializeJsonSafe(context);
  t.mock.method(ServerFetcher.prototype, "get", async () => ({ outputs: [
    { output_index: 0, consumed_by_tx: null }, { output_index: 1, consumed_by_tx: null },
    { output_index: 2, consumed_by_tx: null }
  ] }));
  t.mock.method(ServerFetcher.prototype, "fetchUTxOs", async () => [stateInput]);
  const result = await verifyProposal(proposal);
  assert.equal(result.validity, "invalid");
  assert.equal(result.stateTransition, null);
  assert.ok(result.effect.inputs.every(input => !input.isSttState));
  assert.ok(result.effect.referenceInputs?.every(input => !input.isSttState));
});
