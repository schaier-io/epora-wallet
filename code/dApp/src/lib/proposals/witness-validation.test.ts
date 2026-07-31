import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "@harmoniclabs/crypto";
import { createVKeyWitnessSetHex } from "@/lib/mesh/cst";
import {
  InvalidProposalWitnessError,
  validateVKeyWitnessSet
} from "./witness-validation";

const BODY_HASH = "11".repeat(32);

function sign(bodyHash: string, seedByte: number, corrupt = false) {
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

function witnessSetHex(
  witnesses: { publicKeyHex: string; signatureHex: string }[]
): string {
  return createVKeyWitnessSetHex(witnesses);
}

test("accepts a vkey witness signed by the authenticated payment key", () => {
  const signed = sign(BODY_HASH, 7);
  const result = validateVKeyWitnessSet({
    witnessSetHex: witnessSetHex([signed.witness]),
    txBodyHash: BODY_HASH,
    signerKeyHash: signed.keyHash
  });

  assert.deepEqual(result.keyHashes, [signed.keyHash]);
});

test("rejects a witness that signed a different transaction body", () => {
  const signed = sign("22".repeat(32), 7);
  assert.throws(
    () =>
      validateVKeyWitnessSet({
        witnessSetHex: witnessSetHex([signed.witness]),
        txBodyHash: BODY_HASH,
        signerKeyHash: signed.keyHash
      }),
    InvalidProposalWitnessError
  );
});

test("rejects a valid witness stored under a different session key hash", () => {
  const signed = sign(BODY_HASH, 7);
  assert.throws(
    () =>
      validateVKeyWitnessSet({
        witnessSetHex: witnessSetHex([signed.witness]),
        txBodyHash: BODY_HASH,
        signerKeyHash: "ff".repeat(28)
      }),
    InvalidProposalWitnessError
  );
});

test("rejects a set containing any invalid extra witness", () => {
  const signed = sign(BODY_HASH, 7);
  const corrupt = sign(BODY_HASH, 8, true);
  assert.throws(
    () =>
      validateVKeyWitnessSet({
        witnessSetHex: witnessSetHex([signed.witness, corrupt.witness]),
        txBodyHash: BODY_HASH,
        signerKeyHash: signed.keyHash
      }),
    InvalidProposalWitnessError
  );
});
