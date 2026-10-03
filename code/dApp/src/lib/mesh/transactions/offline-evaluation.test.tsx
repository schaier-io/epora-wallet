// @vitest-environment node
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { OfflineEvaluatorScalus, Transaction as CstTransaction, TransactionBody, HexBlob } from "@meshsdk/core-cst";
import { deserializeTx } from "@/lib/mesh/cst";
import { STT_MINT_VALIDATOR } from "./internals/constants";
import { createOfflineMintFixture, DEFAULT_OFFLINE_COST_MODELS as COST_MODELS } from "./offline-evaluation-mint-fixture";

const EXPECTED_BUDGET = { mem: 470_102, steps: 147_666_434 };

describe("offline Scalus evaluation probe (actual STT V3 mint)", () => {
  it("evaluates the real draft and final transaction with explicit cost models", async () => {
    const { utxos, passes, fetcher } = await createOfflineMintFixture();
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
    const { built, passes } = await createOfflineMintFixture(true);
    expect(passes).toHaveLength(2);
    expect(built.executionUnits?.redeemers).toHaveLength(1);
    expect(built.executionUnits?.redeemers[0]?.validator).toBe(STT_MINT_VALIDATOR);
    expect(BigInt(built.executionUnits!.redeemers[0]!.mem)).toBeGreaterThanOrEqual(BigInt(EXPECTED_BUDGET.mem));
    expect(BigInt(built.executionUnits!.redeemers[0]!.steps)).toBeGreaterThanOrEqual(BigInt(EXPECTED_BUDGET.steps));
    expect(built.txHex).toMatch(/^[0-9a-f]+$/i);
  }, 30_000);

  it("rejects an invalid state datum instead of returning a budget", async () => {
    const { utxos, passes, fetcher } = await createOfflineMintFixture();
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
    const { utxos, passes, fetcher } = await createOfflineMintFixture();
    fetcher.fetchUTxOs = async () => [];
    const evaluator = new OfflineEvaluatorScalus(fetcher, "preprod", undefined, COST_MODELS);
    await expect(evaluator.evaluateTx(passes[1]!, utxos.slice(0, 2))).rejects.toThrow(/UTxO not found/);
  }, 30_000);
});
