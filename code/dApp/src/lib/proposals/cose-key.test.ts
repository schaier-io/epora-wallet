import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "@harmoniclabs/crypto";
import { getCoseKeyFromPublicKey } from "@meshsdk/core-cst";
import { paymentKeyHashFromCoseKey } from "./cose-key";

function keyPair(seedByte: number) {
  const signed = crypto.signEd25519_sync(new Uint8Array([1]), new Uint8Array(32).fill(seedByte));
  const publicKeyHex = Buffer.from(signed.pubKey).toString("hex");
  return {
    publicKeyHex,
    keyHash: Buffer.from(crypto.blake2b_224(signed.pubKey)).toString("hex")
  };
}

function coseKeyHex(publicKeyHex: string): string {
  return getCoseKeyFromPublicKey(publicKeyHex).toString("hex");
}

test("the payment key hash of a COSE_Key is the blake2b-224 of its public key", () => {
  const pair = keyPair(7);
  assert.equal(paymentKeyHashFromCoseKey(coseKeyHex(pair.publicKeyHex)), pair.keyHash);
});

test("two different keys never share a payment key hash", () => {
  const a = keyPair(7);
  const b = keyPair(8);
  assert.notEqual(
    paymentKeyHashFromCoseKey(coseKeyHex(a.publicKeyHex)),
    paymentKeyHashFromCoseKey(coseKeyHex(b.publicKeyHex))
  );
});

test("junk that is not a COSE_Key yields null instead of throwing", () => {
  assert.equal(paymentKeyHashFromCoseKey("zz"), null);
  assert.equal(paymentKeyHashFromCoseKey(""), null);
  assert.equal(paymentKeyHashFromCoseKey("a1"), null);
});
