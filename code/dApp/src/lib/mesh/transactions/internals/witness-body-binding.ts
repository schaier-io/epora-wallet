// Wallet payloads that carry vkey witnesses are only valid if those signatures
// verify against the transaction body the wallet was asked to sign: the ledger
// checks every vkey signature over exactly the blake2b-256 body hash. Merging
// witnesses made for a different body (for example a wallet that signed its own
// stale script-data hash) would otherwise submit a transaction the ledger
// rejects for invalid signatures.
import { hexToBytes } from "ethereum-cryptography/utils";
import { deserializeVKeyWitnessSet } from "@/lib/mesh/cst";
import { verifyVKeyWitnessSignature } from "@/lib/mesh/vkey-witness-verification";

export function assertVKeyWitnessesSignTxBody(args: {
  witnessSetHex: string;
  txBodyHash: string;
}): void {
  const message = hexToBytes(args.txBodyHash.trim().toLowerCase());
  const witnessSet = deserializeVKeyWitnessSet(args.witnessSetHex.trim().toLowerCase());

  for (const witness of witnessSet.vkeys()?.values() ?? []) {
    const { ok, keyHash } = verifyVKeyWitnessSignature({ witness, message });
    if (ok) {
      continue;
    }
    throw new Error(
      `The wallet returned a witness for key hash ${keyHash} that does not verify against the transaction body it was asked to sign.`
    );
  }
}
