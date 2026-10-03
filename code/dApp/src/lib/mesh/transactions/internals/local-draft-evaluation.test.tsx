import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import type { UTxO } from "@meshsdk/common";
import type { LocalEvaluationRequest } from "./local-evaluation-worker";

const mocks = vi.hoisted(() => ({ deserialize: vi.fn(), worker: vi.fn() }));
vi.mock("@/lib/mesh/cst", () => ({ deserializeTx: mocks.deserialize }));
vi.mock("./local-evaluation-worker", () => ({ evaluateInWorker: mocks.worker }));
import { MAX_EVALUATION_INPUTS } from "./constants";
import { evaluateDraftLocally } from "./local-draft-evaluation";
import { Transaction } from "@meshsdk/core";
import { redeemValueWithInlineScript } from "./value";

const hash = (index: number) => index.toString(16).padStart(64, "0");
const output = (index: number): UTxO => ({ input: { txHash: hash(index), outputIndex: 0 }, output: { address: "unused", amount: [] } });
const ref = (index: number) => ({ transactionId: () => hash(index), index: () => 0n });
const collection = (indices: number[]) => ({ values: () => indices.map(ref) });
const action = { tag: "SPEND", index: 0, budget: { mem: 1, steps: 2 } };
let fetcher: TxFetcher;
function transaction(inputs: number[], collateral: number[] = [], references: number[] = []) {
  mocks.deserialize.mockReturnValue({ body: () => ({ inputs: () => collection(inputs), collateral: () => collection(collateral), referenceInputs: () => collection(references) }), witnessSet: () => ({ redeemers: () => ({ size: () => 1 }) }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  transaction([1]);
  mocks.worker.mockResolvedValue([action]);
  fetcher = { get: vi.fn().mockResolvedValue({ cost_models_raw: { PlutusV1: [1], PlutusV2: [2], PlutusV3: [3] } }), fetchUTxOs: vi.fn(async (id: string) => [output(Number.parseInt(id, 16))]) } as unknown as TxFetcher;
});
describe("local draft input context", () => {
  it("uses Mesh-registered inputs without redundant metadata reads", async () => {
    const tx = new Transaction({ initiator: { getUtxos: async () => [], getChangeAddress: async () => "unused", getCollateral: async () => [] } });
    redeemValueWithInlineScript(tx, output(1), { code: "46010000200101", version: "V3" }, { data: { alternative: 0, fields: [] } });
    await evaluateDraftLocally(fetcher, "00", Object.values(tx.txBuilder.meshTxBuilderBody.inputsForEvaluation));
    expect(fetcher.fetchUTxOs).not.toHaveBeenCalled();
    expect((mocks.worker.mock.calls[0][0] as LocalEvaluationRequest).utxos).toEqual([output(1)]);
  });
  it("uses supplied outputs for spending, collateral and reference inputs", async () => {
    transaction([1], [2], [3]);
    await evaluateDraftLocally(fetcher, "00", [output(1), output(2), output(3), output(4)]);
    expect(fetcher.fetchUTxOs).not.toHaveBeenCalled();
    expect((mocks.worker.mock.calls[0][0] as LocalEvaluationRequest).utxos).toEqual([output(1), output(2), output(3)]);
  });
  it("fetches missing input hashes in bounded parallel batches", async () => {
    transaction(Array.from({ length: 17 }, (_, i) => i + 1));
    let active = 0;
    let peak = 0;
    fetcher.fetchUTxOs = vi.fn(async (id: string) => { peak = Math.max(peak, ++active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return [output(Number.parseInt(id, 16))]; });
    await evaluateDraftLocally(fetcher, "00");
    expect(peak).toBe(8);
    expect(fetcher.fetchUTxOs).toHaveBeenCalledTimes(17);
  });
  it("rejects missing outputs before starting the worker", async () => {
    fetcher.fetchUTxOs = vi.fn().mockResolvedValue([]);
    await expect(evaluateDraftLocally(fetcher, "00")).rejects.toThrow("missing an input output");
    expect(mocks.worker).not.toHaveBeenCalled();
  });
  it.each([{}, { cost_models_raw: { PlutusV1: [1], PlutusV2: [2], PlutusV3: [] } }, { cost_models_raw: { PlutusV1: [1.1], PlutusV2: [2], PlutusV3: [3] } }])("rejects unavailable or malformed live models", async raw => {
    fetcher.get = vi.fn().mockResolvedValue(raw);
    await expect(evaluateDraftLocally(fetcher, "00", [output(1)])).rejects.toThrow("live cost models");
    expect(mocks.worker).not.toHaveBeenCalled();
  });
  it("rejects incomplete budgets", async () => {
    mocks.worker.mockResolvedValue([action, { ...action, index: 1 }]);
    await expect(evaluateDraftLocally(fetcher, "00", [output(1)])).rejects.toThrow("incomplete budgets");
  });
  it("does not start reads after cancellation", async () => {
    const controller = new AbortController(); controller.abort(); fetcher = { ...fetcher, signal: controller.signal };
    await expect(evaluateDraftLocally(fetcher, "00")).rejects.toThrow();
    expect(fetcher.get).not.toHaveBeenCalled();
  });
});


it("evaluates more than 64 supplied inputs without extra reads", async () => {
  const indices = Array.from({ length: 66 }, (_, index) => index + 1);
  transaction(indices);
  await evaluateDraftLocally(fetcher, "00", indices.map(output));
  expect(fetcher.fetchUTxOs).not.toHaveBeenCalled();
  expect((mocks.worker.mock.calls[0][0] as LocalEvaluationRequest).utxos).toHaveLength(66);
});

it("rejects inputs beyond the size-based ceiling before reads or worker work", async () => {
  transaction(Array.from({ length: MAX_EVALUATION_INPUTS + 1 }, (_, index) => index + 1));
  await expect(evaluateDraftLocally(fetcher, "00")).rejects.toThrow("input limit");
  expect(fetcher.get).not.toHaveBeenCalled();
  expect(fetcher.fetchUTxOs).not.toHaveBeenCalled();
  expect(mocks.worker).not.toHaveBeenCalled();
});
