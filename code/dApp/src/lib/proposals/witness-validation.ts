import * as crypto from "@harmoniclabs/crypto";
import { deserializeVKeyWitnessSet, type CstParsedWitnessSet } from "@/lib/mesh/cst";
import { proposalCopy } from "./copy";

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
    invalid(proposalCopy.invalidWitnessSet());
  }
  if (!BODY_HASH.test(bodyHash) || !KEY_HASH.test(signerKeyHash)) {
    invalid(proposalCopy.invalidWitnessIdentifiers());
  }

  let witnessSet: CstParsedWitnessSet;
  try {
    witnessSet = deserializeVKeyWitnessSet(witnessSetHex);
  } catch {
    invalid(proposalCopy.couldNotDecodeWitnessSet());
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
    invalid(proposalCopy.vkeyWitnessesOnly());
  }

  const witnesses = witnessSet.vkeys()?.values() ?? [];
  if (witnesses.length === 0 || witnesses.length > MAX_VKEY_WITNESSES) {
    invalid(proposalCopy.witnessCountRange());
  }

  const message = hexToBytes(bodyHash);
  const keyHashes: string[] = [];
  for (const witness of witnesses) {
    const publicKey = hexToBytes(witness.vkey().toString());
    const signature = hexToBytes(witness.signature().toString());
    if (!crypto.verifyEd25519Signature_sync(signature, message, publicKey)) {
      invalid(proposalCopy.invalidWitnessSignature());
    }
    keyHashes.push(bytesToHex(crypto.blake2b_224(publicKey)));
  }

  if (!keyHashes.includes(signerKeyHash)) {
    invalid(proposalCopy.witnessSignerMismatch());
  }

  return {
    witnessSetHex: witnessSet.toCbor().toString().toLowerCase(),
    keyHashes
  };
}
