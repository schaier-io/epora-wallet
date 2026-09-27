// @vitest-environment node
import * as crypto from "@harmoniclabs/crypto";
import { resolveTxHash } from "@meshsdk/core";
import { beforeEach, expect, it, vi } from "vitest";
import { cardanoNetworkId } from "@/lib/cardano-network";
import { addVKeyWitnessSetToTransaction, createVKeyWitnessSetHex, deserializeTx } from "@/lib/mesh/cst";
import type * as ScriptData from "./internals/script-data";
import { setScriptDataHash } from "./internals/script-data";

const providerSubmitTx = vi.hoisted(() => vi.fn());

vi.mock("@/lib/legal/browser-beta-consent", () => ({
  requireBrowserBetaConsent: async () => {}
}));
vi.mock("@/lib/mesh/server-fetcher", () => ({
  ServerFetcher: class {
    submitTx = providerSubmitTx;
  }
}));
vi.mock("./internals", async () => {
  const actual = await vi.importActual<typeof ScriptData>("./internals/script-data");
  return {
    assertSerializedTransactionSizeIsBounded: () => {},
    createStageError: (_stage: string, error: unknown) => error,
    extractComputedScriptIntegrity: () => null,
    isLikelyTransactionCbor: actual.isLikelyTransactionCbor,
    normalizeError: String,
    readScriptDataHash: actual.readScriptDataHash,
    refreshScriptDataHashWithLiveCostModels: async (txHex: string) => ({
      txHex,
      beforeHash: actual.readScriptDataHash(txHex),
      afterHash: actual.readScriptDataHash(txHex),
      changed: false
    }),
    setScriptDataHash: actual.setScriptDataHash,
    withStage: async (_stage: string, run: () => unknown) => run()
  };
});

import { signAndSubmitTx } from "./submit";

const REVIEWED_RECIPIENT = "bb".repeat(28);
const CHANGED_RECIPIENT = "cc".repeat(28);
const SCRIPT_DATA_HASH = "dd".repeat(32);
// One input and one 5 ADA output, with a fee and validity deadline.
const UNSIGNED_TX = `84a40081825820${"aa".repeat(32)}00018182581d60${REVIEWED_RECIPIENT}1a004c4b40021a00030d40031a055d4a80a0f5f6`;

function witnessFor(txHex: string) {
  const signed = crypto.signEd25519_sync(
    Buffer.from(resolveTxHash(txHex), "hex"),
    new Uint8Array(32).fill(9)
  );
  return createVKeyWitnessSetHex([{
    publicKeyHex: Buffer.from(signed.pubKey).toString("hex"),
    signatureHex: Buffer.from(signed.signature).toString("hex")
  }]);
}

function walletReturning(payload: string) {
  return {
    getNetworkId: vi.fn().mockResolvedValue(cardanoNetworkId()),
    signTx: vi.fn().mockResolvedValue(payload),
    submitTx: vi.fn().mockResolvedValue("submitted-hash")
  };
}

beforeEach(() => providerSubmitTx.mockReset());

it.each([null, SCRIPT_DATA_HASH])(
  "rejects a changed recipient even when the script-data hash matches %s",
  async (scriptDataHash) => {
    const reviewed = scriptDataHash ? setScriptDataHash(UNSIGNED_TX, scriptDataHash) : UNSIGNED_TX;
    const changed = reviewed.replace(REVIEWED_RECIPIENT, CHANGED_RECIPIENT);
    const signed = addVKeyWitnessSetToTransaction(changed, witnessFor(changed));
    const wallet = walletReturning(signed);
    const beforeBroadcast = vi.fn();
    expect(resolveTxHash(changed)).not.toBe(resolveTxHash(reviewed));

    await expect(signAndSubmitTx(wallet as never, reviewed, { beforeBroadcast }))
      .rejects.toThrow(/does not verify against the transaction body/);

    expect(beforeBroadcast).not.toHaveBeenCalled();
    expect(wallet.submitTx).not.toHaveBeenCalled();
    expect(providerSubmitTx).not.toHaveBeenCalled();
  }
);

it("accepts a full transaction signed over the reviewed body", async () => {
  const signed = addVKeyWitnessSetToTransaction(UNSIGNED_TX, witnessFor(UNSIGNED_TX));
  const wallet = walletReturning(signed);

  await expect(signAndSubmitTx(wallet as never, UNSIGNED_TX)).resolves.toBe("submitted-hash");

  expect(wallet.submitTx).toHaveBeenCalledWith(signed);
  expect(providerSubmitTx).not.toHaveBeenCalled();
});

it("keeps the reviewed body when a stale envelope contains witnesses for that body", async () => {
  const stale = UNSIGNED_TX.replace(REVIEWED_RECIPIENT, CHANGED_RECIPIENT);
  const witnesses = witnessFor(UNSIGNED_TX);
  const wallet = walletReturning(addVKeyWitnessSetToTransaction(stale, witnesses));

  await expect(signAndSubmitTx(wallet as never, UNSIGNED_TX)).resolves.toBe("submitted-hash");

  const submitted = wallet.submitTx.mock.calls[0]![0] as string;
  expect(resolveTxHash(submitted)).toBe(resolveTxHash(UNSIGNED_TX));
  expect(deserializeTx(submitted).witnessSet().toCbor().toString()).toBe(witnesses);
});
