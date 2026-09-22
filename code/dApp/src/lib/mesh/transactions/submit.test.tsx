// @vitest-environment node
import * as crypto from "@harmoniclabs/crypto";
import type * as MeshCst from "@/lib/mesh/cst";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSerializedTransactionSizeIsBounded: vi.fn(),
  addVKeyWitnessSetToTransaction: vi.fn().mockReturnValue("signed-transaction"),
  providerSubmitTx: vi.fn(),
  refresh: vi.fn(),
  extractIntegrity: vi.fn(),
  deserializeTx: vi.fn(),
  isLikelyTransactionCbor: vi.fn(),
  readScriptDataHash: vi.fn()
}));

vi.mock("./internals", () => ({
  assertSerializedTransactionSizeIsBounded: mocks.assertSerializedTransactionSizeIsBounded,
  createStageError: (_stage: string, error: unknown) => error,
  extractComputedScriptIntegrity: mocks.extractIntegrity,
  isLikelyTransactionCbor: mocks.isLikelyTransactionCbor,
  normalizeError: (error: unknown) => String(error),
  readScriptDataHash: mocks.readScriptDataHash,
  refreshScriptDataHashWithLiveCostModels: mocks.refresh,
  setScriptDataHash: () => "corrected",
  withStage: async (_stage: string, run: () => unknown) => run()
}));
vi.mock("@/lib/mesh/cst", async (importOriginal) => ({
  ...(await importOriginal<typeof MeshCst>()),
  addVKeyWitnessSetToTransaction: mocks.addVKeyWitnessSetToTransaction,
  deserializeTx: mocks.deserializeTx
}));
vi.mock("@/lib/mesh/server-fetcher", () => ({
  ServerFetcher: class {
    submitTx = mocks.providerSubmitTx;
  }
}));

vi.mock("@meshsdk/core", () => ({ resolveTxHash: () => "ab".repeat(32) }));

import { createVKeyWitnessSetHex } from "@/lib/mesh/cst";
import { signAndSubmitTx } from "./submit";

beforeEach(() => {
  mocks.assertSerializedTransactionSizeIsBounded.mockReset();
  mocks.extractIntegrity.mockReset().mockReturnValue(null);
  mocks.providerSubmitTx.mockReset();
  mocks.refresh.mockReset().mockImplementation(async (txHex: string) => ({
    txHex, beforeHash: null, afterHash: null, changed: false
  }));
  mocks.deserializeTx.mockReset().mockImplementation(() => ({ body: () => ({ ttl: () => 12345 }) }));
  mocks.isLikelyTransactionCbor.mockReset().mockReturnValue(false);
  mocks.readScriptDataHash.mockReset().mockImplementation(
    (txHex: string) => txHex === "corrected" ? "correct-hash" : null
  );
});

// Real ed25519 witnesses for the mocked intended body hash (resolveTxHash is
// mocked to "ab".repeat(32)); signatures over any other hash are stale-body
// witnesses that must never reach submission.
function walletWitnessSetHex(bodyHash: string) {
  const signed = crypto.signEd25519_sync(
    Buffer.from(bodyHash, "hex"),
    new Uint8Array(32).fill(9)
  );
  return createVKeyWitnessSetHex([{
    publicKeyHex: Buffer.from(signed.pubKey).toString("hex"),
    signatureHex: Buffer.from(signed.signature).toString("hex")
  }]);
}

// Witness payload the wallet returns in the plain witness-set tests: the merge
// now verifies signatures against the intended body, so the payload must be a
// real witness set that verifies.
const VERIFYING_WALLET_PAYLOAD = walletWitnessSetHex("ab".repeat(32));

function staleBodyWalletScenario(returnedWitnessSetHex: string) {
  mocks.refresh.mockImplementation(async (txHex: string) => ({
    txHex, beforeHash: null, afterHash: "expected-hash", changed: true
  }));
  mocks.readScriptDataHash.mockImplementation(() => "expected-hash");
  mocks.isLikelyTransactionCbor.mockReturnValue(true);
  mocks.deserializeTx.mockImplementation((txHex: string) => txHex === "wallet-full-tx" ? {
    body: () => ({
      scriptDataHash: () => ({ toString: () => "stale-hash" }),
      ttl: () => 12345
    }),
    witnessSet: () => ({ toCbor: () => returnedWitnessSetHex })
  } : { body: () => ({ ttl: () => 12345 }) });
  return {
    wallet: {
      getNetworkId: vi.fn().mockResolvedValue(0), signTx: vi.fn().mockResolvedValue("wallet-full-tx"),
      submitTx: vi.fn().mockResolvedValue("tx-hash")
    }
  };
}

it("checks the signed transaction size before wallet submission", async () => {
  const wallet = {
    getNetworkId: vi.fn().mockResolvedValue(0), signTx: vi.fn().mockResolvedValue(VERIFYING_WALLET_PAYLOAD),
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
    getNetworkId: vi.fn().mockResolvedValue(0), signTx: vi.fn().mockResolvedValue(VERIFYING_WALLET_PAYLOAD),
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
    getNetworkId: vi.fn().mockResolvedValue(0), signTx: vi.fn(async () => { events.push("sign"); return VERIFYING_WALLET_PAYLOAD; }),
    submitTx: vi.fn(async () => { events.push("wallet-submit"); throw new Error("unavailable"); })
  };
  mocks.providerSubmitTx.mockImplementation(async () => { events.push("provider-submit"); return "hash"; });
  await signAndSubmitTx(wallet as never, "unsigned", { assertCurrent: () => { events.push("check"); } });
  expect(events).toEqual(["refresh", "check", "sign", "check", "wallet-submit", "check", "provider-submit"]);
});
for (const failAt of [1, 2, 3]) it(`stops when freshness check ${failAt} fails`, async () => {
  const wallet = { getNetworkId: vi.fn().mockResolvedValue(0), signTx: vi.fn().mockResolvedValue(VERIFYING_WALLET_PAYLOAD), submitTx: vi.fn().mockRejectedValue(new Error("unavailable")) };
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
    getNetworkId: vi.fn().mockResolvedValue(0), signTx: vi.fn().mockResolvedValue(VERIFYING_WALLET_PAYLOAD),
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

it("records the signed body before any broadcast and stops if recording fails", async () => {
  const order: string[] = [];
  const wallet = {
    getNetworkId: vi.fn().mockResolvedValue(0), signTx: vi.fn().mockResolvedValue(VERIFYING_WALLET_PAYLOAD),
    submitTx: vi.fn(async () => { order.push("broadcast"); return "hash"; })
  };
  const record = vi.fn(() => { order.push("record"); });
  await signAndSubmitTx(wallet as never, "unsigned-transaction", { beforeBroadcast: record });
  expect(record).toHaveBeenCalledWith({ txHash: "ab".repeat(32), invalidHereafter: 12345 });
  expect(order).toEqual(["record", "broadcast"]);
  wallet.submitTx.mockClear();
  await expect(signAndSubmitTx(wallet as never, "unsigned-transaction", { beforeBroadcast: () => {
    throw new Error("Storage unavailable");
  } })).rejects.toThrow("Storage unavailable");
  expect(wallet.submitTx).not.toHaveBeenCalled();
  expect(mocks.providerSubmitTx).not.toHaveBeenCalled();
});

it("merges wallet witnesses that verify against the intended body when the wallet returns its own stale-body transaction", async () => {
  const { wallet } = staleBodyWalletScenario(walletWitnessSetHex("ab".repeat(32)));

  await expect(signAndSubmitTx(wallet as never, "unsigned")).resolves.toBe("tx-hash");
  expect(mocks.addVKeyWitnessSetToTransaction).toHaveBeenCalledWith(
    "unsigned",
    expect.any(String)
  );
  expect(wallet.submitTx).toHaveBeenCalledWith("signed-transaction");
});

it("rejects wallet witnesses signed over a stale body before any submission", async () => {
  const { wallet } = staleBodyWalletScenario(walletWitnessSetHex("cd".repeat(32)));

  await expect(signAndSubmitTx(wallet as never, "unsigned")).rejects.toThrow(
    /does not verify against the transaction body/
  );
  expect(mocks.addVKeyWitnessSetToTransaction).not.toHaveBeenCalled();
  expect(wallet.submitTx).not.toHaveBeenCalled();
  expect(mocks.providerSubmitTx).not.toHaveBeenCalled();
});


it("rejects the wrong wallet network before provider access or signing", async () => {
  const wallet = { getNetworkId: vi.fn().mockResolvedValue(1), signTx: vi.fn(), submitTx: vi.fn() };
  await expect(signAndSubmitTx(wallet as never, "tx")).rejects.toThrow("must use preprod");
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(wallet.signTx).not.toHaveBeenCalled();
  expect(wallet.submitTx).not.toHaveBeenCalled();
});

it("does not broadcast if the wallet changes network during signing", async () => {
  const wallet = {
    getNetworkId: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValue(1),
    signTx: vi.fn().mockResolvedValue(VERIFYING_WALLET_PAYLOAD),
    submitTx: vi.fn()
  };
  await expect(signAndSubmitTx(wallet as never, "tx")).rejects.toThrow("must use preprod");
  expect(wallet.signTx).toHaveBeenCalledOnce();
  expect(wallet.submitTx).not.toHaveBeenCalled();
  expect(mocks.providerSubmitTx).not.toHaveBeenCalled();
});
