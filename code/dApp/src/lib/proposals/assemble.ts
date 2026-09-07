import {
  addVKeyWitnessSetToTransaction,
  createVKeyWitnessSetHex,
  deserializeTx,
  deserializeVKeyWitnessSet
} from "@/lib/mesh/cst";
import type { ProposalDetailDto } from "./types";
import { validateVKeyWitnessSet } from "./witness-validation";

// Most wallets return a bare vkey witness set from signTx(_, true), but some
// return the whole signed transaction. Normalize to a witness set so signatures
// merge cleanly regardless of wallet.
export function normalizeWitnessSetHex(signPayload: string): string {
  const trimmed = signPayload.trim();
  const firstByte = Number.parseInt(trimmed.slice(0, 2), 16);
  const isTransactionCbor = Number.isFinite(firstByte) && firstByte >> 5 === 4;
  if (isTransactionCbor) {
    try {
      return deserializeTx(trimmed).witnessSet().toCbor().toString();
    } catch {
      // fall through and treat as already a witness set
    }
  }
  return trimmed;
}

// Multi-sig signatures are collected over the exact unsigned body that was saved
// (and reviewed by every signer). We therefore assemble by merging the current
// witness sets into that body verbatim, so we must NOT mutate the body afterwards
// (e.g. refresh the script-data hash), since that would invalidate everyone's
// signatures. If protocol cost models drift and the body becomes stale, submit
// fails and the proposal is flagged invalid for rebuild instead.
//
// One wallet can hold several participant keys and then returns every key's
// witness on each sign, so the same witness arrives under more than one signer
// row. Mesh's merge concatenates, so each vkey is added once and the fee that
// was estimated for one witness per signer stays right.

export function assembleSignedTx(proposal: ProposalDetailDto): string {
  let txHex = proposal.unsignedTxHex;
  const mergedVkeys = new Set<string>();
  for (const signature of proposal.signatures) {
    if (!signature.current) {
      continue;
    }
    const validated = validateVKeyWitnessSet({
      witnessSetHex: signature.witnessSetHex,
      txBodyHash: proposal.txBodyHash,
      signerKeyHash: signature.signerKeyHash
    });
    const witnesses = deserializeVKeyWitnessSet(validated.witnessSetHex).vkeys()?.values() ?? [];
    const fresh = witnesses.filter(
      (witness) => !mergedVkeys.has(witness.vkey().toString().toLowerCase())
    );
    if (fresh.length === 0) {
      continue;
    }
    for (const witness of fresh) {
      mergedVkeys.add(witness.vkey().toString().toLowerCase());
    }
    const witnessSetHex =
      fresh.length === witnesses.length
        ? validated.witnessSetHex
        : createVKeyWitnessSetHex(
            fresh.map((witness) => ({
              publicKeyHex: witness.vkey().toString(),
              signatureHex: witness.signature().toString()
            }))
          );
    txHex = addVKeyWitnessSetToTransaction(txHex, witnessSetHex);
  }
  return txHex;
}
