// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSerializedTransactionIsBounded: vi.fn(),
  addVKeyWitnessSetToTransaction: vi.fn().mockReturnValue("signed-transaction"),
  providerSubmitTx: vi.fn()
}));

vi.mock("./internals", () => ({
  assertSerializedTransactionIsBounded: mocks.assertSerializedTransactionIsBounded,
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
  deserializeTx: vi.fn()
}));
vi.mock("@/lib/mesh/server-fetcher", () => ({
  ServerFetcher: class {
    submitTx = mocks.providerSubmitTx;
  }
}));

import { signAndSubmitTx } from "./submit";

beforeEach(() => {
  mocks.assertSerializedTransactionIsBounded.mockReset();
  mocks.providerSubmitTx.mockReset();
});

it("checks the signed transaction before wallet submission", async () => {
  const wallet = {
    signTx: vi.fn().mockResolvedValue("witness-set"),
    submitTx: vi.fn().mockResolvedValue("tx-hash")
  };

  await expect(signAndSubmitTx(wallet as never, "unsigned-transaction")).resolves.toBe(
    "tx-hash"
  );
  expect(mocks.assertSerializedTransactionIsBounded).toHaveBeenCalledWith(
    "signed-transaction"
  );
  expect(wallet.submitTx).toHaveBeenCalledWith("signed-transaction");
});

it("does not submit a signed transaction that exceeds a bound", async () => {
  const wallet = {
    signTx: vi.fn().mockResolvedValue("witness-set"),
    submitTx: vi.fn()
  };
  mocks.assertSerializedTransactionIsBounded.mockImplementationOnce(() => {
    throw new Error("signed transaction is too large");
  });

  await expect(
    signAndSubmitTx(wallet as never, "unsigned-transaction")
  ).rejects.toThrow("signed transaction is too large");
  expect(wallet.submitTx).not.toHaveBeenCalled();
  expect(mocks.providerSubmitTx).not.toHaveBeenCalled();
});
