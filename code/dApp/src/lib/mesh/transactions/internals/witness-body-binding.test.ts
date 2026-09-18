import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "@harmoniclabs/crypto";
import { createVKeyWitnessSetHex } from "@/lib/mesh/cst";
import { assertVKeyWitnessesSignTxBody } from "./witness-body-binding";

const BODY_HASH = "11".repeat(32);

function witness(bodyHash: string, seedByte: number, corrupt = false) {
  const signed = crypto.signEd25519_sync(
    Buffer.from(bodyHash, "hex"),
    new Uint8Array(32).fill(seedByte)
  );
  const publicKeyHex = Buffer.from(signed.pubKey).toString("hex");
  const signature = Buffer.from(signed.signature);
  if (corrupt) {
    signature[0] ^= 0xff;
  }
  return {
    keyHash: Buffer.from(crypto.blake2b_224(Buffer.from(publicKeyHex, "hex"))).toString("hex"),
    witness: { publicKeyHex, signatureHex: signature.toString("hex") }
  };
}

test("accepts witnesses that verify against the transaction body hash", () => {
  const signed = witness(BODY_HASH, 7);
  assert.doesNotThrow(() =>
    assertVKeyWitnessesSignTxBody({
      witnessSetHex: createVKeyWitnessSetHex([signed.witness]),
      txBodyHash: BODY_HASH
    })
  );
});

// Regression for issue #384: a wallet that signs its own stale body returns
// witnesses made over a different body hash. Those must never be merged.
test("rejects a witness that signed a different transaction body", () => {
  const stale = witness("22".repeat(32), 7);
  assert.throws(
    () =>
      assertVKeyWitnessesSignTxBody({
        witnessSetHex: createVKeyWitnessSetHex([stale.witness]),
        txBodyHash: BODY_HASH
      }),
    /does not verify against the transaction body/
  );
});

test("names the failing key hash in the error", () => {
  const stale = witness("22".repeat(32), 7);
  assert.throws(
    () =>
      assertVKeyWitnessesSignTxBody({
        witnessSetHex: createVKeyWitnessSetHex([stale.witness]),
        txBodyHash: BODY_HASH
      }),
    (error: unknown) => error instanceof Error && error.message.includes(stale.keyHash)
  );
});

test("rejects a corrupted signature", () => {
  const corrupt = witness(BODY_HASH, 8, true);
  assert.throws(
    () =>
      assertVKeyWitnessesSignTxBody({
        witnessSetHex: createVKeyWitnessSetHex([corrupt.witness]),
        txBodyHash: BODY_HASH
      }),
    /does not verify against the transaction body/
  );
});

// Some wallets (eternl) echo the transaction's whole witness set from signTx,
// including non-vkey entries. Those extra entries must not bounce the merge.
test("accepts a wallet echo that carries non-vkey entries", () => {
  const signed = witness(BODY_HASH, 7);
  const bare = createVKeyWitnessSetHex([signed.witness]);
  // Widen the CBOR map by one entry and append key 4 (plutus_data) with an
  // array payload the CST parser accepts, mimicking the wallet echo.
  const withDatum = `a2${bare.slice(2)}04820102`;
  assert.doesNotThrow(() =>
    assertVKeyWitnessesSignTxBody({ witnessSetHex: withDatum, txBodyHash: BODY_HASH })
  );
});
