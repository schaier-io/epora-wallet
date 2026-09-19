// Shared ed25519 verification for one CBOR vkey witness. Both wallet-payload
// consumers run the same two steps per witness: verify the signature over the
// transaction body hash the ledger checks, and derive the blake2b-224 key hash
// (submit-time body binding names it in its error; proposal validation
// collects it to match the authenticated signer). The vkey and signature hex
// come from a parsed witness set; `message` is the exact bytes the signature
// must cover. Malformed signatures (wrong length) and undecodable curve
// points throw from @harmoniclabs/crypto and propagate to the caller
// unchanged, matching both consumers' pre-extraction behavior.
import * as crypto from "@harmoniclabs/crypto";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";
import type { CstVkeyWitness } from "@/lib/mesh/cst";

export function verifyVKeyWitnessSignature(args: {
  witness: CstVkeyWitness;
  message: Uint8Array;
}): { ok: boolean; keyHash: string } {
  const publicKey = hexToBytes(args.witness.vkey().toString());
  const signature = hexToBytes(args.witness.signature().toString());
  const ok = crypto.verifyEd25519Signature_sync(signature, args.message, publicKey);
  return { ok, keyHash: bytesToHex(crypto.blake2b_224(publicKey)) };
}
