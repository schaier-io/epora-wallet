import * as crypto from "@harmoniclabs/crypto";
import { deserializeVKeyWitnessSet, type CstParsedWitnessSet } from "@/lib/mesh/cst";

const BODY_HASH = /^[0-9a-f]{64}$/i;
const KEY_HASH = /^[0-9a-f]{56}$/i;
const HEX = /^[0-9a-f]+$/i;
const MAX_WITNESS_SET_BYTES = 32 * 1024;
const MAX_VKEY_WITNESSES = 16;

export class InvalidProposalWitnessError extends Error {}

export type ValidatedVKeyWitnessSet = {
  witnessSetHex: string;
  keyHashes: string[];
};

function invalid(message: string): never {
  throw new InvalidProposalWitnessError(message);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateVKeyWitnessSet(args: {
  witnessSetHex: string;
  txBodyHash: string;
  signerKeyHash: string;
}): ValidatedVKeyWitnessSet {
  const witnessSetHex = args.witnessSetHex.trim().toLowerCase();
  const bodyHash = args.txBodyHash.trim().toLowerCase();
  const signerKeyHash = args.signerKeyHash.trim().toLowerCase();

  if (
    !HEX.test(witnessSetHex) ||
    witnessSetHex.length % 2 !== 0 ||
    witnessSetHex.length / 2 > MAX_WITNESS_SET_BYTES
  ) {
    invalid("Invalid or oversized transaction witness set.");
  }
  if (!BODY_HASH.test(bodyHash) || !KEY_HASH.test(signerKeyHash)) {
    invalid("Invalid transaction body hash or signer key hash.");
  }

  let witnessSet: CstParsedWitnessSet;
  try {
    witnessSet = deserializeVKeyWitnessSet(witnessSetHex);
  } catch {
    invalid("Could not decode the transaction witness set.");
  }

  if (
    witnessSet.nativeScripts() ||
    witnessSet.bootstraps() ||
    witnessSet.plutusV1Scripts() ||
    witnessSet.plutusV2Scripts() ||
    witnessSet.plutusV3Scripts() ||
    witnessSet.plutusData() ||
    witnessSet.redeemers()
  ) {
    invalid("Only vkey witnesses may be attached to a proposal signature.");
  }

  const witnesses = witnessSet.vkeys()?.values() ?? [];
  if (witnesses.length === 0 || witnesses.length > MAX_VKEY_WITNESSES) {
    invalid("Witness set must contain between 1 and 16 vkey witnesses.");
  }

  const message = hexToBytes(bodyHash);
  const keyHashes: string[] = [];
  for (const witness of witnesses) {
    const publicKey = hexToBytes(witness.vkey().toString());
    const signature = hexToBytes(witness.signature().toString());
    if (!crypto.verifyEd25519Signature_sync(signature, message, publicKey)) {
      invalid("Witness set contains a signature that is invalid for this transaction body.");
    }
    keyHashes.push(bytesToHex(crypto.blake2b_224(publicKey)));
  }

  if (!keyHashes.includes(signerKeyHash)) {
    invalid("Witness set was not signed by the authenticated wallet key.");
  }

  return {
    witnessSetHex: witnessSet.toCbor().toString().toLowerCase(),
    keyHashes
  };
}
