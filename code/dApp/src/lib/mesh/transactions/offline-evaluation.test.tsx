// @vitest-environment node
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROTOCOL_PARAMETERS, DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST } from "@meshsdk/common";
import { OfflineEvaluatorScalus, Transaction as CstTransaction, TransactionBody, HexBlob, toScriptRef } from "@meshsdk/core-cst";
import { resolveScriptHash, type UTxO } from "@meshsdk/core";
import { getSttMintScript, resolveSttReferenceStoreAddress } from "@/lib/contracts/blueprint";
import { createDefaultStateForm, stateFormToDatum, withFallbackAdminUserInStateForm } from "@/lib/contracts/state-form";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { deserializeTx } from "@/lib/mesh/cst";
import { STT_MINT_VALIDATOR } from "./internals/constants";
import { buildMintStateTokenTx } from "./mint-state-token";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const COST_MODELS = [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST];
const EXPECTED_BUDGET = { mem: 470_102, steps: 147_666_434 };
const REFERENCE_HASH = "22".repeat(32);

async function fixture(useLocalEvaluation = false) {
  const script = getSttMintScript();
  const utxos: UTxO[] = [0, 1].map(outputIndex => ({
    input: { txHash: "11".repeat(32), outputIndex },
    output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "100000000" }] }
  }));
  utxos.push({ input: { txHash: REFERENCE_HASH, outputIndex: 0 }, output: {
    address: resolveSttReferenceStoreAddress(), amount: [{ unit: "lovelace", quantity: "100000000" }],
    scriptRef: String(toScriptRef(script).toCbor()), scriptHash: resolveScriptHash(script.code, script.version)
  } });
  const fetcher = new ServerFetcher();
  fetcher.fetchProtocolParameters = async () => DEFAULT_PROTOCOL_PARAMETERS;
  fetcher.fetchCostModels = async () => COST_MODELS;
  fetcher.fetchUTxOs = async (hash, index) => utxos.filter(utxo => utxo.input.txHash === hash && (index === undefined || utxo.input.outputIndex === index));
  fetcher.get = async path => path.includes("epochs/latest/parameters")
    ? { cost_models_raw: { PlutusV1: COST_MODELS[0], PlutusV2: COST_MODELS[1], PlutusV3: COST_MODELS[2] } }
    : { outputs: [{ output_index: 0, consumed_by_tx: null }] };
  const passes: string[] = [];
  const localEvaluator = new OfflineEvaluatorScalus(fetcher, "preprod", undefined, COST_MODELS);
  fetcher.evaluateTx = async txHex => {
    passes.push(txHex);
    return useLocalEvaluation ? localEvaluator.evaluateTx(txHex, utxos)
      : [{ index: 0, tag: "MINT", budget: { mem: 700_000, steps: 300_000_000 } }];
  };
  const wallet = {
    getUtxos: async () => utxos.slice(0, 2), getChangeAddress: async () => ADDRESS,
    getUsedAddresses: async () => [ADDRESS], getUnusedAddresses: async () => []
  };
  const built = await buildMintStateTokenTx(wallet, {
    stateDatum: stateFormToDatum(withFallbackAdminUserInStateForm(createDefaultStateForm(), "11".repeat(28))),
    mintLovelace: "2000000", sttSpendReference: `${REFERENCE_HASH}#0`
  }, fetcher);
  return { utxos, passes, fetcher, built };
}

describe("offline Scalus evaluation probe (actual STT V3 mint)", () => {
  it("evaluates the real draft and final transaction with explicit cost models", async () => {
    const { utxos, passes, fetcher } = await fixture();
    expect(passes).toHaveLength(2);
    fetcher.fetchUTxOs = async () => { throw new Error("unexpected chain read"); };
    const evaluator = new OfflineEvaluatorScalus(fetcher, "preprod", undefined, COST_MODELS);
    for (const [index, txHex] of passes.entries()) {
      expect(deserializeTx(txHex).witnessSet().redeemers()?.size()).toBe(1);
      for (let sample = 0; sample < 4; sample++) {
        const start = performance.now();
        const result = await evaluator.evaluateTx(txHex, utxos);
        const milliseconds = performance.now() - start;
        expect(result).toHaveLength(1);
        expect(result[0]?.tag).toBe("MINT");
        expect(result[0]?.budget).toEqual(EXPECTED_BUDGET);
        process.stdout.write(`[offline-evaluation:probe] ${JSON.stringify({ pass: index === 0 ? "draft" : "final", sample, milliseconds, result })}\n`);
      }
    }
  }, 30_000);

  it("builds both STT mint passes with local evaluation and applies their budgets", async () => {
    const { built, passes } = await fixture(true);
    expect(passes).toHaveLength(2);
    expect(built.executionUnits?.redeemers).toHaveLength(1);
    expect(built.executionUnits?.redeemers[0]?.validator).toBe(STT_MINT_VALIDATOR);
    expect(BigInt(built.executionUnits!.redeemers[0]!.mem)).toBeGreaterThanOrEqual(BigInt(EXPECTED_BUDGET.mem));
    expect(BigInt(built.executionUnits!.redeemers[0]!.steps)).toBeGreaterThanOrEqual(BigInt(EXPECTED_BUDGET.steps));
    expect(built.txHex).toMatch(/^[0-9a-f]+$/i);
  }, 30_000);

  it("rejects an invalid state datum instead of returning a budget", async () => {
    const { utxos, passes, fetcher } = await fixture();
    const tx = CstTransaction.fromCbor(HexBlob(passes[1]!));
    const body = tx.body().toCore();
    body.outputs[0]!.datum = 99n;
    tx.setBody(TransactionBody.fromCore(body));
    const evaluator = new OfflineEvaluatorScalus(fetcher, "preprod", undefined, COST_MODELS);
    const invalidHex = String(tx.toCbor());
    expect(CstTransaction.fromCbor(HexBlob(invalidHex)).body().toCore().outputs[0]!.datum).toBe(99n);
    await expect(evaluator.evaluateTx(invalidHex, utxos)).rejects.toThrow(
      /Builtin error: UnConstrData.*Const\(Data\(99\)\).*scalus\.uplc\.eval\.DeserializationError/
    );
  }, 30_000);

  it("rejects a missing reference script output instead of returning a budget", async () => {
    const { utxos, passes, fetcher } = await fixture();
    fetcher.fetchUTxOs = async () => [];
    const evaluator = new OfflineEvaluatorScalus(fetcher, "preprod", undefined, COST_MODELS);
    await expect(evaluator.evaluateTx(passes[1]!, utxos.slice(0, 2))).rejects.toThrow(/UTxO not found/);
  }, 30_000);
});
