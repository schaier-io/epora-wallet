// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { BlockfrostProvider, UTxO } from "@meshsdk/core";
import { createServerTxFetcher } from "./server-wallet";

const configured = vi.hoisted(() => ({ provider: undefined as unknown as BlockfrostProvider }));
vi.mock("./blockfrost-server", () => ({ getBlockfrostProvider: () => configured.provider }));

it("direct server builds recover reported overlaps and preserve unknown outputs", async () => {
  const hash = "ab".repeat(32);
  const outputs = [0, 1].map(outputIndex => ({ input: { txHash: hash, outputIndex }, output: { address: "unused", amount: [] } })) satisfies UTxO[];
  const error = JSON.stringify(JSON.stringify({ result: { EvaluationFailure: {
    AdditionalUtxoOverlap: [{ txId: hash, index: 0 }]
  } } }));
  const budgets = [{ tag: "SPEND" as const, index: 0, budget: { mem: 1, steps: 2 } }];
  const evaluate = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(budgets);
  const source = { evaluateTx: evaluate };
  configured.provider = source as unknown as BlockfrostProvider;
  const fetcher = createServerTxFetcher();
  const chained = ["chained-tx"];
  await expect(fetcher.evaluateTx("tx", outputs, chained)).resolves.toEqual(budgets);
  expect(evaluate).toHaveBeenCalledTimes(2);
  expect(evaluate).toHaveBeenNthCalledWith(1, "tx", outputs, chained);
  expect(evaluate).toHaveBeenNthCalledWith(2, "tx", [outputs[1]], chained);
  expect(evaluate.mock.contexts).toEqual([source, source]);
});
