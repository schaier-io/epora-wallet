import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { type BrowserWallet } from "@meshsdk/core";
import { addVKeyWitnessSetToTransaction, deserializeTx } from "@/lib/mesh/cst";
import type { ProposalDetailDto } from "./types";

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
      // fall through — treat as already a witness set
    }
  }
  return trimmed;
}

// Multi-sig signatures are collected over the exact unsigned body that was saved
// (and reviewed by every signer). We therefore assemble by merging the current
// witness sets into that body verbatim — we must NOT mutate the body afterwards
// (e.g. refresh the script-data hash), since that would invalidate everyone's
// signatures. If protocol cost models drift and the body becomes stale, submit
// fails and the proposal is flagged invalid for rebuild instead.

export function assembleSignedTx(proposal: ProposalDetailDto): string {
  let txHex = proposal.unsignedTxHex;
  for (const signature of proposal.signatures) {
    if (!signature.current) {
      continue;
    }
    txHex = addVKeyWitnessSetToTransaction(txHex, signature.witnessSetHex);
  }
  return txHex;
}

// Submits the assembled transaction, preferring the connected wallet and falling
// back to the server-side Blockfrost proxy. Returns the on-chain tx hash.
export async function submitAssembledTx(
  signedTxHex: string,
  wallet?: BrowserWallet | null
): Promise<string> {
  if (wallet) {
    try {
      return await wallet.submitTx(signedTxHex);
    } catch {
      // fall through to server proxy
    }
  }
  return new ServerFetcher().submitTx(signedTxHex);
}
