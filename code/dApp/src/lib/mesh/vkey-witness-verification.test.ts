import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "@harmoniclabs/crypto";
import {
  createVKeyWitnessSetHex,
  deserializeVKeyWitnessSet,
  type CstVkeyWitness
} from "@/lib/mesh/cst";
import { verifyVKeyWitnessSignature } from "./vkey-witness-verification";

const MESSAGE = new Uint8Array(32).fill(0x11);

function witnessesOf(witnessSetHex: string): readonly CstVkeyWitness[] {
  return deserializeVKeyWitnessSet(witnessSetHex).vkeys()?.values() ?? [];
}

function signedWitnessSet(message: Uint8Array, seedByte: number) {
  const signed = crypto.signEd25519_sync(message, new Uint8Array(32).fill(seedByte));
  const publicKeyHex = Buffer.from(signed.pubKey).toString("hex");
  return {
    keyHash: Buffer.from(crypto.blake2b_224(Buffer.from(publicKeyHex, "hex"))).toString("hex"),
    witnessSetHex: createVKeyWitnessSetHex([
      {
        publicKeyHex,
        signatureHex: Buffer.from(signed.signature).toString("hex")
      }
    ])
  };
}

test("returns ok and the derived key hash for a signature over the message", () => {
  const { keyHash, witnessSetHex } = signedWitnessSet(MESSAGE, 7);
  const [witness] = witnessesOf(witnessSetHex);

  assert.deepEqual(verifyVKeyWitnessSignature({ witness, message: MESSAGE }), {
    ok: true,
    keyHash
  });
});

test("reports ok false and still names the key hash for a signature over a different message", () => {
  const { keyHash, witnessSetHex } = signedWitnessSet(new Uint8Array(32).fill(0x22), 7);
  const [witness] = witnessesOf(witnessSetHex);

  assert.deepEqual(verifyVKeyWitnessSignature({ witness, message: MESSAGE }), {
    ok: false,
    keyHash
  });
});

// The crypto primitive throws on a signature that is not exactly 64 bytes (and
// on undecodable curve points); both consumers rely on that throw propagating.
test("propagates the crypto error for a malformed signature length", () => {
  const malformed: CstVkeyWitness = {
    vkey: () => ({ toString: () => "aa".repeat(32) }),
    signature: () => ({ toString: () => "bb".repeat(32) }),
    toCore: () => ["aa".repeat(32), "bb".repeat(32)]
  };

  assert.throws(
    () => verifyVKeyWitnessSignature({ witness: malformed, message: MESSAGE }),
    /unexpected signature length/
  );
});
