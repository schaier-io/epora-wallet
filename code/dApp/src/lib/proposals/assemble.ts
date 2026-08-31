import { addVKeyWitnessSetToTransaction, deserializeTx } from "@/lib/mesh/cst";
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

export function assembleSignedTx(proposal: ProposalDetailDto): string {
  let txHex = proposal.unsignedTxHex;
  for (const signature of proposal.signatures) {
    if (!signature.current) {
      continue;
    }
    const validated = validateVKeyWitnessSet({
      witnessSetHex: signature.witnessSetHex,
      txBodyHash: proposal.txBodyHash,
      signerKeyHash: signature.signerKeyHash
    });
    txHex = addVKeyWitnessSetToTransaction(txHex, validated.witnessSetHex);
  }
  return txHex;
}
