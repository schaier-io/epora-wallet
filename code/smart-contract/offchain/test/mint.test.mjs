import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_PROTOCOL_PARAMETERS, DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST } from "@meshsdk/core";
import { addVKeyWitnessSetToTransaction, CborSet, deserializeTx, Ed25519PublicKeyHex, Ed25519SignatureHex, TransactionWitnessSet, VkeyWitness, toScriptRef } from "@meshsdk/core-cst";
import { loadBlueprint, plutusScript, policyIdOf, scriptAddress, sttAssetName } from "../lib/blueprint.mjs";
import { buildSttMintTx } from "../lib/mint.mjs";

const blueprint = loadBlueprint(fileURLToPath(new URL("../../plutus.json", import.meta.url)));
const script = plutusScript(blueprint, "stt.stt.mint");
const referenceHash = "22".repeat(32);
const address = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const utxo = (hash, index) => ({ input: { txHash: hash, outputIndex: index }, output: {
  address, amount: [{ unit: "lovelace", quantity: "100000000" }]
} });

test("the CLI rejects a missing reference before provider or key access", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "mint-stt-reference-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of ["STT_SPEND_REFERENCE", "BLOCKFROST_API_KEY", "CARDANO_PROVIDER_URL", "DOTENV_CONFIG_PATH"]) delete env[key];
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../mint-stt.mjs", import.meta.url))], {
    cwd, env, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set STT_SPEND_REFERENCE/);
  assert.doesNotMatch(result.stderr, /Missing BLOCKFROST_API_KEY|wallet_1\.sk|ENOENT/);
  assert.equal(result.stdout, "");
});

function fixture({ reference = true, status = null, wrongScript = false, wrongIndex = false,
  scriptRef, scriptHash, collateralIsReference = false } = {}) {
  const funds = utxo("11".repeat(32), 0);
  const collateral = utxo("33".repeat(32), 0);
  const referenceUtxo = utxo(referenceHash, wrongIndex ? 1 : 0);
  const attached = wrongScript ? plutusScript(blueprint, "stt_reference_store.stt_reference_store.spend") : script;
  referenceUtxo.output.scriptRef = String(toScriptRef(attached).toCbor());
  referenceUtxo.output.scriptHash = policyIdOf(attached);
  if (scriptRef !== undefined) referenceUtxo.output.scriptRef = scriptRef;
  if (scriptHash !== undefined) referenceUtxo.output.scriptHash = scriptHash;
  referenceUtxo.output.address = scriptAddress(attached);
  const wallet = {
    getUtxos: async () => [referenceUtxo, funds, collateral],
    getCollateral: async () => collateralIsReference ? [referenceUtxo] : [collateral],
    getChangeAddress: async () => address, getUsedAddresses: async () => [address],
    getUnusedAddresses: async () => [address]
  };
  const provider = {
    fetchAddressUTxOs: async () => assert.fail("No address scans are needed"),
    fetchUTxOs: async () => reference ? [referenceUtxo] : [],
    fetchProtocolParameters: async () => DEFAULT_PROTOCOL_PARAMETERS,
    fetchCostModels: async () => [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST],
    get: async () => ({ outputs: [{ output_index: 0, ...(status === "missing" ? {} : { consumed_by_tx: status }) }] }),
    evaluateTx: async () => [{ tag: "MINT", index: 0, budget: { mem: 700_000, steps: 300_000_000 } }]
  };
  return { wallet, provider, blueprint, sttSpendReference: `${referenceHash}#0`, nowMs: 1_788_000_000_000 };
}

test("the maintained CLI builder uses a reference and fits after adding a funding witness", async (t) => {
  const result = await buildSttMintTx(fixture());
  const parsed = deserializeTx(result.unsignedTx);
  assert.equal(parsed.body().referenceInputs().values()[0].transactionId(), referenceHash);
  assert.equal(parsed.witnessSet().plutusV3Scripts()?.values().length ?? 0, 0);
  assert.ok(parsed.body().inputs().values().every((input) => input.transactionId() !== referenceHash));
  assert.ok(parsed.body().collateral().values().every((input) => input.transactionId() !== referenceHash));
  assert.equal(result.assetName, sttAssetName("11".repeat(32), 0));
  const witness = new VkeyWitness(Ed25519PublicKeyHex("11".repeat(32)), Ed25519SignatureHex("22".repeat(64)));
  const witnesses = new TransactionWitnessSet();
  witnesses.setVkeys(CborSet.fromCore([witness.toCore()], VkeyWitness.fromCore));
  // Fixed witness bytes measure serialized size, not signature validity.
  const signed = addVKeyWitnessSetToTransaction(result.unsignedTx, witnesses.toCbor());
  assert.ok(signed.length / 2 <= DEFAULT_PROTOCOL_PARAMETERS.maxTxSize);
  t.diagnostic(`Serialized transaction with one fixed-size witness: ${signed.length / 2} bytes; limit: ${DEFAULT_PROTOCOL_PARAMETERS.maxTxSize}. Evaluation uses a stub.`);
});

for (const [name, options, reference, message] of [
  ["missing reference", {}, "", /STT_SPEND_REFERENCE/],
  ["malformed reference", {}, "not-a-reference", /txHash#index/],
  ["spent reference", { status: "aa".repeat(32) }, undefined, /unspent/],
  ["unknown status", { status: "missing" }, undefined, /unspent/],
  ["missing output", { reference: false }, undefined, /reference.*output/i],
  ["wrong output index", { wrongIndex: true }, undefined, /reference.*output/i],
  ["wrong script", { wrongScript: true }, undefined, /script/],
  ["missing script", { scriptRef: "" }, undefined, /script/],
  ["wrong reported hash", { scriptHash: "00".repeat(28) }, undefined, /script/],
  ["reference used as collateral", { collateralIsReference: true }, undefined, /collateral/]
]) {
  test(`the CLI rejects ${name} before signing`, async () => {
    const input = fixture(options);
    if (reference !== undefined) input.sttSpendReference = reference;
    await assert.rejects(buildSttMintTx(input), message);
  });
}
