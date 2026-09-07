import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "@harmoniclabs/crypto";
import { createVKeyWitnessSetHex, deserializeTx, type CstParsedWitnessSet } from "@/lib/mesh/cst";
import { assembleSignedTx } from "./assemble";
import { resolveProposalBodyHash } from "./serialization";
import type { ProposalDetailDto, ProposalSignatureDto } from "./types";

// One input, one output, fee, `invalid_hereafter` = slot 90000000. Built once
// with the CST classes and pinned here so the test needs no builder.
const UNSIGNED_TX_HEX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a0f5f6";
const BODY_HASH = resolveProposalBodyHash(UNSIGNED_TX_HEX);

function signer(seedByte: number) {
  const signed = crypto.signEd25519_sync(
    Buffer.from(BODY_HASH, "hex"),
    new Uint8Array(32).fill(seedByte)
  );
  const publicKeyHex = Buffer.from(signed.pubKey).toString("hex");
  return {
    keyHash: Buffer.from(crypto.blake2b_224(signed.pubKey)).toString("hex"),
    witness: { publicKeyHex, signatureHex: Buffer.from(signed.signature).toString("hex") }
  };
}

function signature(
  signerKeyHash: string,
  witnesses: { publicKeyHex: string; signatureHex: string }[]
): ProposalSignatureDto {
  return {
    signerKeyHash,
    witnessSetHex: createVKeyWitnessSetHex(witnesses),
    current: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  } as ProposalSignatureDto;
}

function proposal(signatures: ProposalSignatureDto[]): ProposalDetailDto {
  return {
    unsignedTxHex: UNSIGNED_TX_HEX,
    txBodyHash: BODY_HASH,
    signatures
  } as ProposalDetailDto;
}

function vkeyCount(txHex: string): number {
  const witnessSet = deserializeTx(txHex).witnessSet() as unknown as CstParsedWitnessSet;
  return witnessSet.vkeys()?.values().length ?? 0;
}

test("merges one witness per signer into the unsigned body", () => {
  const a = signer(7);
  const b = signer(8);
  const assembled = assembleSignedTx(
    proposal([signature(a.keyHash, [a.witness]), signature(b.keyHash, [b.witness])])
  );
  assert.equal(vkeyCount(assembled), 2);
  assert.equal(resolveProposalBodyHash(assembled), BODY_HASH);
});

test("a witness that arrives under two signer rows is added once", () => {
  const a = signer(7);
  const b = signer(8);
  // One browser wallet holding both keys returns both witnesses on every sign.
  const both = [a.witness, b.witness];
  const assembled = assembleSignedTx(
    proposal([signature(a.keyHash, both), signature(b.keyHash, both)])
  );
  assert.equal(vkeyCount(assembled), 2);
});

test("a superseded signature is skipped", () => {
  const a = signer(7);
  const stale = { ...signature(a.keyHash, [a.witness]), current: false };
  assert.equal(vkeyCount(assembleSignedTx(proposal([stale]))), 0);
});
