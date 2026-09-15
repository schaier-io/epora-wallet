// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSerializedTransactionSizeIsBounded: vi.fn(),
  addVKeyWitnessSetToTransaction: vi.fn().mockReturnValue("signed-transaction"),
  providerSubmitTx: vi.fn(),
  refresh: vi.fn(),
  extractIntegrity: vi.fn()
}));

vi.mock("./internals", () => ({
  assertSerializedTransactionSizeIsBounded: mocks.assertSerializedTransactionSizeIsBounded,
  createStageError: (_stage: string, error: unknown) => error,
  extractComputedScriptIntegrity: mocks.extractIntegrity,
  isLikelyTransactionCbor: () => false,
  normalizeError: (error: unknown) => String(error),
  readScriptDataHash: (txHex: string) => txHex === "corrected" ? "correct-hash" : null,
  refreshScriptDataHashWithLiveCostModels: mocks.refresh,
  setScriptDataHash: () => "corrected",
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
  mocks.assertSerializedTransactionSizeIsBounded.mockReset();
  mocks.extractIntegrity.mockReset().mockReturnValue(null);
  mocks.providerSubmitTx.mockReset();
  mocks.refresh.mockReset().mockImplementation(async (txHex: string) => ({
    txHex, beforeHash: null, afterHash: null, changed: false
  }));
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

it("checks after refresh and before sign, wallet submit, and provider fallback", async () => {
  const events: string[] = [];
  mocks.refresh.mockImplementation(async (txHex: string) => {
    events.push("refresh"); return { txHex, beforeHash: null, afterHash: null, changed: false };
  });
  const wallet = {
    signTx: vi.fn(async () => { events.push("sign"); return "witness-set"; }),
    submitTx: vi.fn(async () => { events.push("wallet-submit"); throw new Error("unavailable"); })
  };
  mocks.providerSubmitTx.mockImplementation(async () => { events.push("provider-submit"); return "hash"; });
  await signAndSubmitTx(wallet as never, "unsigned", { assertCurrent: () => { events.push("check"); } });
  expect(events).toEqual(["refresh", "check", "sign", "check", "wallet-submit", "check", "provider-submit"]);
});
for (const failAt of [1, 2, 3]) it(`stops when freshness check ${failAt} fails`, async () => {
  const wallet = { signTx: vi.fn().mockResolvedValue("witness-set"), submitTx: vi.fn().mockRejectedValue(new Error("unavailable")) };
  let checks = 0;
  await expect(signAndSubmitTx(wallet as never, "unsigned", { assertCurrent: async () => {
    checks += 1; if (checks === failAt) throw new Error("stale");
  } })).rejects.toThrow("stale");
  expect(wallet.signTx).toHaveBeenCalledTimes(failAt > 1 ? 1 : 0);
  expect(wallet.submitTx).toHaveBeenCalledTimes(failAt > 2 ? 1 : 0);
  expect(mocks.providerSubmitTx).not.toHaveBeenCalled();
});

it("checks again before signing the script-integrity retry", async () => {
  const wallet = {
    signTx: vi.fn().mockResolvedValue("witness-set"),
    submitTx: vi.fn().mockRejectedValue(new Error("integrity mismatch"))
  };
  mocks.extractIntegrity.mockReturnValue("correct-hash");
  const assertCurrent = vi.fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("stale before retry"));
  await expect(signAndSubmitTx(wallet as never, "unsigned", { assertCurrent }))
    .rejects.toThrow("stale before retry");
  expect(assertCurrent).toHaveBeenCalledTimes(3);
  expect(wallet.signTx).toHaveBeenCalledTimes(1);
  expect(wallet.submitTx).toHaveBeenCalledTimes(1);
  expect(mocks.providerSubmitTx).not.toHaveBeenCalled();
});
