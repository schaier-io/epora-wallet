import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST
} from "@meshsdk/common";
import { resolveScriptHash, type UTxO } from "@meshsdk/core";
import {
  deserializeTx, type CstCollection, type CstTransactionInput, type CstTransactionOutput
} from "@/lib/mesh/cst";
import type { TxFetcher, WalletSource } from "@/lib/mesh/tx-context";
import { buildTransactionWithReestimatedLimits } from "./budget";
import type { RuntimeTxBuilder } from "./budget-runtime-builder";
import { MAX_CACHED_EVALUATIONS_PER_PASS } from "./build-parameter-fetcher";
import { setupTransaction } from "./core";
import { createNoChangeAdaSelector } from "./no-change-ada-selector";
import { applyMintWitness } from "./witness";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const FUNDING_CANDIDATES = 20;
const FIRST_FUNDING_LOVELACE = 10_000_000n;
const FUNDING_INCREMENT_LOVELACE = 1_000_000n;
const COLLATERAL_LOVELACE = 5_000_000n;
const PAYOUT_FLOOR_LOVELACE = 2_000_000n;
const REFERENCE_TIME_MS = 2_000_000_000_000;
const MOCK_BUDGET = { mem: 700_000, steps: 300_000_000 };
const COST_MODELS = [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST];

function fundingUtxo(txHash: string, lovelace: bigint): UTxO {
  return {
    input: { txHash, outputIndex: 0 },
    output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: lovelace.toString() }] }
  };
}

test("Mesh payout selection reuses exact candidates per pass and preserves transaction value", async (context) => {
  // This exercises real Mesh selection and serialization with mocked evaluation.
  // It does not validate the application contracts or a live ledger transaction.
  context.mock.method(console, "debug", () => undefined);
  const funding = Array.from({ length: FUNDING_CANDIDATES }, (_, index) => fundingUtxo(
    (index + 1).toString(16).padStart(64, "0"),
    FIRST_FUNDING_LOVELACE + BigInt(index) * FUNDING_INCREMENT_LOVELACE
  ));
  const collateral = fundingUtxo("bb".repeat(32), COLLATERAL_LOVELACE);
  const walletUtxos = [...funding, collateral];
  const wallet: WalletSource = {
    getUtxos: async () => walletUtxos,
    getChangeAddress: async () => ADDRESS,
    getUsedAddresses: async () => [ADDRESS],
    getUnusedAddresses: async () => []
  };
  let preparations = 0;
  const requestsByPass: string[][] = [];
  // A generic provider keeps the existing browser Worker path out of this test.
  const provider: Pick<TxFetcher,
    "fetchProtocolParameters" | "fetchCostModels" | "get" | "evaluateTx"
  > = {
    fetchProtocolParameters: async () => DEFAULT_PROTOCOL_PARAMETERS,
    fetchCostModels: async () => COST_MODELS,
    get: async () => ({ cost_models_raw: {
      PlutusV1: COST_MODELS[0], PlutusV2: COST_MODELS[1], PlutusV3: COST_MODELS[2]
    } }),
    evaluateTx: async (txHex, additionalUtxos, additionalTxs) => {
      requestsByPass[preparations - 1]!.push(JSON.stringify([txHex, additionalUtxos, additionalTxs]));
      return (deserializeTx(txHex).witnessSet().redeemers()?.values() ?? []).map(redeemer => ({
        index: Number(redeemer.index()), tag: "MINT" as const, budget: { ...MOCK_BUDGET }
      }));
    }
  };
  const script = { code: "46010000200101", version: "V3" as const };
  const policy = resolveScriptHash(script.code, script.version);
  const assetName = "01";
  const mintedUnit = `${policy}${assetName}`;
  const result = await buildTransactionWithReestimatedLimits("draft", "final", async (overrides, fetcher) => {
    preparations += 1;
    requestsByPass.push([]);
    const excludedRefs = new Set<string>();
    const selector = createNoChangeAdaSelector({
      resolveSinkOutputIndex: () => 0,
      excludedInputRefs: () => excludedRefs
    });
    const { tx, signerAddress } = await setupTransaction(wallet, REFERENCE_TIME_MS, fetcher, {
      selector, excludedSelectionInputRefs: excludedRefs
    });
    applyMintWitness(tx.txBuilder as RuntimeTxBuilder, policy, assetName, script, null, overrides?.mintBudgets[0]);
    tx.isCollateralNeeded = true;
    tx.sendAssets(ADDRESS, [
      { unit: "lovelace", quantity: PAYOUT_FLOOR_LOVELACE.toString() },
      { unit: mintedUnit, quantity: "1" }
    ]);
    return {
      tx, signerAddress, diagnostics: {},
      resolveAdjustableLovelaceOutput: () => ({
        outputIndex: 0, minimumLovelace: PAYOUT_FLOOR_LOVELACE, requireNoAppendedOutputs: true
      })
    };
  }, provider as TxFetcher);

  assert.equal(preparations, 2);
  for (const requests of requestsByPass) {
    assert.ok(requests.length > 1, "each pass must reach the provider for different funding candidates");
    assert.ok(requests.length < MAX_CACHED_EVALUATIONS_PER_PASS, "the fixture must fit within the cache bound");
    assert.equal(requests.length, new Set(requests).size, "a provider request must occur only once per pass");
  }
  const transaction = deserializeTx(result.txHex);
  const body = transaction.body();
  const outputs = body.outputs() as CstTransactionOutput[];
  assert.equal(outputs.length, 1, "funding change must remain in the payout sink");
  assert.ok(BigInt(outputs[0]!.amount().coin().toString()) >= PAYOUT_FLOOR_LOVELACE);
  assert.deepEqual(Array.from(outputs[0]!.amount().multiasset()?.entries() ?? [], ([unit, quantity]) => [
    unit.toString(), quantity.toString()
  ]), [[mintedUnit, "1"]]);
  const lovelaceByRef = new Map(walletUtxos.map(utxo => [
    `${utxo.input.txHash}#${utxo.input.outputIndex}`, BigInt(utxo.output.amount[0]!.quantity)
  ]));
  const inputs = body.inputs() as CstCollection<CstTransactionInput>;
  const inputLovelace = inputs.values().reduce((sum, input) => {
    assert.notEqual(input.transactionId().toString(), collateral.input.txHash);
    const amount = lovelaceByRef.get(`${input.transactionId()}#${input.index()}`);
    assert.notEqual(amount, undefined, "every selected input must belong to the fixture wallet");
    return sum + amount!;
  }, 0n);
  const outputLovelace = outputs.reduce((sum, output) => sum + BigInt(output.amount().coin().toString()), 0n);
  assert.equal(inputLovelace, outputLovelace + BigInt(body.fee().toString()));
  assert.equal(result.estimatedFeeLovelace, body.fee().toString());
  assert.equal(body.collateral()?.values()[0]?.transactionId().toString(), collateral.input.txHash);
  context.diagnostic(JSON.stringify({
    preparations, fundingCandidates: funding.length, upstreamRequestsByPass: requestsByPass.map(requests => requests.length)
  }));
});
