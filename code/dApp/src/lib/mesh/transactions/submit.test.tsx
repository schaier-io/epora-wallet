// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSerializedTransactionSizeIsBounded: vi.fn(),
  addVKeyWitnessSetToTransaction: vi.fn().mockReturnValue("signed-transaction"),
  providerSubmitTx: vi.fn()
}));

vi.mock("./internals", () => ({
  assertSerializedTransactionSizeIsBounded: mocks.assertSerializedTransactionSizeIsBounded,
  createStageError: (_stage: string, error: unknown) => error,
  extractComputedScriptIntegrity: () => null,
  isLikelyTransactionCbor: () => false,
  normalizeError: (error: unknown) => String(error),
  readScriptDataHash: () => null,
  refreshScriptDataHashWithLiveCostModels: async (txHex: string) => ({
    txHex,
    beforeHash: null,
    afterHash: null,
    changed: false
  }),
  setScriptDataHash: (txHex: string) => txHex,
  withStage: async (_stage: string, run: () => unknown) => run()
}));
vi.mock("@/lib/mesh/cst", () => ({
  addVKeyWitnessSetToTransaction: mocks.addVKeyWitnessSetToTransaction,
  deserializeTx: vi.fn(() => ({ body: () => ({ ttl: () => 12345 }) }))
}));
vi.mock("@/lib/mesh/server-fetcher", () => ({
  ServerFetcher: class {
    submitTx = mocks.providerSubmitTx;
  }
}));

vi.mock("@meshsdk/core", () => ({ resolveTxHash: () => "ab".repeat(32) }));

import { signAndSubmitTx } from "./submit";

beforeEach(() => {
  mocks.assertSerializedTransactionSizeIsBounded.mockReset();
  mocks.providerSubmitTx.mockReset();
});

it("checks the signed transaction size before wallet submission", async () => {
  const wallet = {
    signTx: vi.fn().mockResolvedValue("witness-set"),
    submitTx: vi.fn().mockResolvedValue("tx-hash")
  };

  await expect(signAndSubmitTx(wallet as never, "unsigned-transaction")).resolves.toBe(
    "tx-hash"
  );
  expect(mocks.assertSerializedTransactionSizeIsBounded).toHaveBeenCalledWith(
    "signed-transaction"
  );
  expect(wallet.submitTx).toHaveBeenCalledWith("signed-transaction");
});

it("does not submit a signed transaction that exceeds the size bound", async () => {
  const wallet = {
    signTx: vi.fn().mockResolvedValue("witness-set"),
    submitTx: vi.fn()
  };
  mocks.assertSerializedTransactionSizeIsBounded.mockImplementationOnce(() => {
    throw new Error("signed transaction is too large");
  });

  await expect(
    signAndSubmitTx(wallet as never, "unsigned-transaction")
  ).rejects.toThrow("signed transaction is too large");
  expect(wallet.submitTx).not.toHaveBeenCalled();
  expect(mocks.providerSubmitTx).not.toHaveBeenCalled();
});

it("records the signed body before any broadcast and stops if recording fails", async () => {
  const order: string[] = [];
  const wallet = {
    signTx: vi.fn().mockResolvedValue("witness-set"),
    submitTx: vi.fn(async () => { order.push("broadcast"); return "hash"; })
  };
  const record = vi.fn(() => { order.push("record"); });
  await signAndSubmitTx(wallet as never, "unsigned-transaction", record);
  expect(record).toHaveBeenCalledWith({ txHash: "ab".repeat(32), invalidHereafter: 12345 });
  expect(order).toEqual(["record", "broadcast"]);
  wallet.submitTx.mockClear();
  await expect(signAndSubmitTx(wallet as never, "unsigned-transaction", () => {
    throw new Error("Storage unavailable");
  })).rejects.toThrow("Storage unavailable");
  expect(wallet.submitTx).not.toHaveBeenCalled();
  expect(mocks.providerSubmitTx).not.toHaveBeenCalled();
});
