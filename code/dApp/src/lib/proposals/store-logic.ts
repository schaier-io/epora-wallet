import type { MultiSigProposal, ProposalSignature } from "@/generated/prisma";
import type {
  ProposalAuthorityPath,
  ProposalDetailDto,
  ProposalListItemDto,
  ProposalSignatureDto,
  ProposalStatus
} from "./types";

// Pure, server-only-free logic for the proposal store: row→DTO mappers and the
// signature precondition guard. Extracted from store.ts so it is unit-testable
// without Prisma or the `server-only` import — store.ts binds the singleton
// client and delegates the row mapping / guarding here.

type SignatureWithFlag = ProposalSignatureDto & { witnessSetHex: string };

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

// Guards a signature write: a proposal must exist, be OPEN, and still carry the
// body hash the signer reviewed. The body-hash check is the fund-safety gate —
// it rejects signing a body that was rebuilt out from under the signer between
// fetch and submit. Pure so the precondition can be tested without a database.
export function evaluateProposalSignatureGuard(
  proposal: { txBodyHash: string; status: string } | null,
  expectedBodyHash: string
): { ok: true } | { ok: false; status: number; error: string } {
  if (!proposal) {
    return { ok: false, status: 404, error: "Proposal not found." };
  }
  if (proposal.status !== "OPEN") {
    return { ok: false, status: 409, error: `Proposal is ${proposal.status.toLowerCase()}.` };
  }
  if (proposal.txBodyHash !== expectedBodyHash) {
    return {
      ok: false,
      status: 409,
      error: "The proposal was rebuilt. Reload and re-verify before signing."
    };
  }
  return { ok: true };
}
