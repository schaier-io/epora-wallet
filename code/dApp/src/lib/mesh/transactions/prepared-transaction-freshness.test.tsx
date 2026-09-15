// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SLOT_CONFIG_NETWORK, unixTimeToEnclosingSlot } from "@meshsdk/core";
import { NETWORK } from "./internals/constants";
const mocks = vi.hoisted(() => ({ get: vi.fn(), deserializeTx: vi.fn() }));
vi.mock("@/lib/mesh/cst", async (original) => ({ ...await original<object>(), deserializeTx: mocks.deserializeTx }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { get = mocks.get; } }));
import { assertPreparedTransactionFresh } from "./prepared-transaction-freshness";
const NOW = 1_800_000_000_000;
const hash = "ab".repeat(32);
const input = (index: number) => ({ transactionId: () => hash, index: () => index });
const slot = (time: number) => unixTimeToEnclosingSlot(time, SLOT_CONFIG_NETWORK[NETWORK]);
const outputs = (spent = -1) => ({ outputs: [0, 1, 2].map(output_index => ({ output_index, consumed_by_tx: output_index === spent ? "spent" : null })) });
function transaction(start = NOW - 60_000, end = NOW + 120_000) {
  return { body: () => ({ validityStartInterval: () => slot(start), ttl: () => slot(end),
    inputs: () => ({ values: () => [input(0)] }), referenceInputs: () => ({ values: () => [input(1)] }),
    collateral: () => ({ values: () => [input(2)] }) }) };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  mocks.deserializeTx.mockReturnValue(transaction());
  mocks.get.mockReset().mockResolvedValue(outputs());
});
afterEach(() => vi.useRealTimers());
it("checks every input kind and only shares reads within one check", async () => {
  await assertPreparedTransactionFresh("transaction");
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(`txs/${hash}/utxos`);
  await assertPreparedTransactionFresh("transaction"); expect(mocks.get).toHaveBeenCalledTimes(2);
});
for (const index of [0, 1, 2]) it(`rejects spent input ${index}`, async () => {
  mocks.get.mockResolvedValue(outputs(index));
  await expect(assertPreparedTransactionFresh("transaction")).rejects.toThrow("already spent");
});
for (const response of [{}, { outputs: [] }, { outputs: [{ output_index: 0 }] }]) it("fails closed when status is missing", async () => {
  mocks.get.mockResolvedValue(response);
  await expect(assertPreparedTransactionFresh("transaction")).rejects.toThrow("no verified unspent status");
});
it("rejects unavailable provider", async () => {
  mocks.get.mockRejectedValue(new Error("offline"));
  await expect(assertPreparedTransactionFresh("transaction")).rejects.toThrow("offline");
});
it("rejects future validity and expiry within signing margin", async () => {
  mocks.deserializeTx.mockReturnValue(transaction(NOW + 10_000));
  await expect(assertPreparedTransactionFresh("transaction")).rejects.toThrow("not valid yet");
  mocks.deserializeTx.mockReturnValue(transaction(NOW - 10_000, NOW + 30_000));
  await expect(assertPreparedTransactionFresh("transaction")).rejects.toThrow("expires too soon");
  expect(mocks.get).not.toHaveBeenCalled();
});
it("checks expiry after chain reads", async () => {
  mocks.get.mockImplementation(async () => { vi.setSystemTime(NOW + 100_000); return outputs(); });
  await expect(assertPreparedTransactionFresh("transaction")).rejects.toThrow("expires too soon");
});
