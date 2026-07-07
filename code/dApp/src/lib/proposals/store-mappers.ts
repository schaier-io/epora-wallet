import type { MultiSigProposal, ProposalSignature } from "@/generated/prisma";
import type {
  ProposalAuthorityPath,
  ProposalDetailDto,
  ProposalListItemDto,
  ProposalSignatureDto,
  ProposalStatus
} from "./types";

// Pure row -> DTO mapping for multi-sig proposals. Deliberately free of
// `server-only` and the Prisma client (it imports Prisma *types* only, which are
// erased at compile time) so the reconstruction logic — the `current` witness
// flag, signer counting, and the current-first ordering — can be unit-tested
// without a database. `store.ts` owns the DB access and re-exports through these.

export type SignatureWithFlag = ProposalSignatureDto & { witnessSetHex: string };

export function mapSignature(
  signature: ProposalSignature,
  currentBodyHash: string
): SignatureWithFlag {
  return {
    signerKeyHash: signature.signerKeyHash,
    witnessSetHex: signature.witnessSetHex,
    current: signature.txBodyHash === currentBodyHash,
    createdAt: signature.createdAt.toISOString()
  };
}

export function mapListItem(
  row: MultiSigProposal,
  signatures: ProposalSignature[]
): ProposalListItemDto {
  const current = signatures.filter((signature) => signature.txBodyHash === row.txBodyHash);
  return {
    id: row.id,
    walletUnit: row.walletUnit,
    walletPolicyId: row.walletPolicyId,
    title: row.title,
    description: row.description,
    actionKind: row.actionKind,
    authorityPath: row.authorityPath as ProposalAuthorityPath,
    status: row.status as ProposalStatus,
    txBodyHash: row.txBodyHash,
    submittedTxHash: row.submittedTxHash,
    createdByKeyHash: row.createdByKeyHash,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    signatureCount: current.length,
    signerKeyHashes: current.map((signature) => signature.signerKeyHash)
  };
}

export function mapDetail(
  row: MultiSigProposal,
  signatures: ProposalSignature[]
): ProposalDetailDto {
  return {
    ...mapListItem(row, signatures),
    unsignedTxHex: row.unsignedTxHex,
    // Forwarded as raw JSON text: datum values may contain bigint/Map, which
    // would break NextResponse.json. The client decodes with the safe reviver.
    buildContextJson: row.buildContextJson,
    summaryJson: row.summaryJson,
    signatures: signatures
      .map((signature) => mapSignature(signature, row.txBodyHash))
      // Current witnesses first, then stale, each newest-first.
      .sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt))
  };
}
