import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST
} from "@meshsdk/common";
import { resolveScriptHash } from "@meshsdk/core";
import { deserializeTx, type CstTransactionOutput } from "@/lib/mesh/cst";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import type { WalletSource } from "@/lib/mesh/tx-context";
import type { ContractConfig } from "@/lib/types/contracts";
import { buildLockFundsTx } from "../lock-funds";
import { buildTransactionWithReestimatedLimits } from "./budget";
import { setupTransaction } from "./core";
import { createEmptyExecutionValidatorLabels } from "./execution-snapshot";
import { applyMintWitness } from "./witness";
import type { RuntimeTxBuilder } from "./budget-runtime-builder";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const CONFIG = {
  walletPolicyId: "ab".repeat(28), walletAssetNameHex: "deadbeef", sttAssetNameHex: "deadbeef"
} as ContractConfig;
const TOKEN = `${"cd".repeat(28)}01`;
const COST_MODELS = [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST];

function fixture() {
  const calls = { utxos: 0, protocol: 0, costModels: 0, evaluations: 0, rawParameters: 0 };
  const wallet: WalletSource = {
    getUtxos: async () => {
      calls.utxos++;
      return [
        { input: { txHash: "11".repeat(32), outputIndex: 0 }, output: { address: ADDRESS, amount: [
          { unit: "lovelace", quantity: "100000000" }, { unit: TOKEN, quantity: "7" }
        ] } },
        { input: { txHash: "22".repeat(32), outputIndex: 0 }, output: { address: ADDRESS, amount: [
          { unit: "lovelace", quantity: "5000000" }
        ] } }
      ];
    },
    getChangeAddress: async () => ADDRESS,
    getUsedAddresses: async () => [ADDRESS],
    getUnusedAddresses: async () => []
  };
  const fetcher = new ServerFetcher();
  fetcher.fetchProtocolParameters = async () => { calls.protocol++; return DEFAULT_PROTOCOL_PARAMETERS; };
  fetcher.fetchCostModels = async () => { calls.costModels++; return COST_MODELS; };
  fetcher.evaluateTx = async txHex => {
    calls.evaluations++;
    return (deserializeTx(txHex).witnessSet().redeemers()?.values() ?? []).map(redeemer => ({
      index: Number(redeemer.index()), tag: "MINT" as const, budget: { mem: 700_000, steps: 300_000_000 }
    }));
  };
  fetcher.get = async () => {
    calls.rawParameters++;
    return { cost_models_raw: { PlutusV1: COST_MODELS[0], PlutusV2: COST_MODELS[1], PlutusV3: COST_MODELS[2] } };
  };
  return { wallet, fetcher, calls };
}

test("deposit builds once without evaluation and preserves assets, datum, fee, and change", async () => {
  const { wallet, fetcher, calls } = fixture();
  const result = await buildLockFundsTx(wallet, CONFIG, {
    assets: [{ unit: "lovelace", quantity: "2000000" }, { unit: TOKEN, quantity: "3" }],
    inlineDatum: { alternative: 0, fields: [] }
  }, fetcher);
  assert.deepEqual(calls, { utxos: 1, protocol: 1, costModels: 1, evaluations: 0, rawParameters: 0 });
  const tx = deserializeTx(result.txHex);
  const outputs = tx.body().outputs() as CstTransactionOutput[];
  assert.equal(outputs[0]!.amount().coin().toString(), "2000000");
  const tokenAmounts = outputs.map(output => new Map(
    [...(output.amount().multiasset()?.entries() ?? [])].map(([unit, quantity]) => [unit.toString(), quantity.toString()])
  ).get(TOKEN));
  assert.equal(tokenAmounts[0], "3");
  assert.ok(outputs[0]!.datum());
  assert.equal(tokenAmounts[1], "4");
  const total = outputs.reduce((sum, output) => sum + BigInt(output.amount().coin().toString()), 0n);
  assert.equal(total + BigInt(tx.body().fee().toString()), 100_000_000n);
  assert.equal(result.estimatedFeeLovelace, tx.body().fee().toString());
  assert.equal(tx.witnessSet().redeemers()?.size() ?? 0, 0);
});

test("unlabelled Plutus mint still prepares twice and evaluates both builds", async () => {
  const { wallet, fetcher, calls } = fixture();
  const script = { code: "46010000200101", version: "V3" as const };
  const policy = resolveScriptHash(script.code, script.version);
  let preparations = 0;
  const result = await buildTransactionWithReestimatedLimits("draft", "final", async (overrides, buildFetcher) => {
    preparations++;
    const { tx, signerAddress } = await setupTransaction(wallet, undefined, buildFetcher);
    applyMintWitness(tx.txBuilder as RuntimeTxBuilder, policy, "01", script, null, overrides?.mintBudgets[0]);
    tx.isCollateralNeeded = true;
    tx.sendAssets(ADDRESS, [{ unit: `${policy}01`, quantity: "1" }]);
    return { tx, signerAddress, diagnostics: {}, executionLabels: createEmptyExecutionValidatorLabels() };
  }, fetcher);
  assert.equal(preparations, 2);
  assert.equal(calls.evaluations, 2);
  assert.equal(calls.protocol, 1);
  assert.equal(calls.costModels, 1);
  assert.equal(calls.rawParameters, 1);
  assert.equal(deserializeTx(result.txHex).witnessSet().redeemers()?.size(), 1);
  assert.equal(result.executionUnits.redeemers.length, 1);
});

test("deposit fast path still rejects insufficient funds", async () => {
  const { wallet, fetcher } = fixture();
  await assert.rejects(buildLockFundsTx(wallet, CONFIG, {
    assets: [{ unit: "lovelace", quantity: "200000000" }]
  }, fetcher));
});
