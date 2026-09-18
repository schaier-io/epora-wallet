// Wallet payloads that carry vkey witnesses are only valid if those signatures
// verify against the transaction body the wallet was asked to sign: the ledger
// checks every vkey signature over exactly the blake2b-256 body hash. Merging
// witnesses made for a different body (for example a wallet that signed its own
// stale script-data hash) would otherwise submit a transaction the ledger
// rejects for invalid signatures.
import * as crypto from "@harmoniclabs/crypto";
import { deserializeVKeyWitnessSet } from "@/lib/mesh/cst";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

export function assertVKeyWitnessesSignTxBody(args: {
  witnessSetHex: string;
  txBodyHash: string;
}): void {
  const message = hexToBytes(args.txBodyHash.trim().toLowerCase());
  const witnessSet = deserializeVKeyWitnessSet(args.witnessSetHex.trim().toLowerCase());

  for (const witness of witnessSet.vkeys()?.values() ?? []) {
    const publicKey = hexToBytes(witness.vkey().toString());
    const signature = hexToBytes(witness.signature().toString());
    if (crypto.verifyEd25519Signature_sync(signature, message, publicKey)) {
      continue;
    }
    const keyHash = bytesToHex(crypto.blake2b_224(publicKey));
    throw new Error(
      `The wallet returned a witness for key hash ${keyHash} that does not verify against the transaction body it was asked to sign.`
    );
  }
}
