import "server-only";

import type { GovernanceAction } from "@/lib/api/governance-actions";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { koiosBaseUrl } from "@/lib/discovery/koios-server";

const LOOKUP_TIMEOUT_MS = 15_000;

// An action is open for votes until one of these epochs is set. Blockfrost's proposal list
// carries none of them, so listing open actions there costs one request per proposal.
const ACTIVE_PROPOSALS_QUERY = new URLSearchParams({
  ratified_epoch: "is.null",
  enacted_epoch: "is.null",
  dropped_epoch: "is.null",
  expired_epoch: "is.null",
  // Only the CIP-108 title and abstract: the whole document can run to many kilobytes.
  select: [
    "proposal_id,proposal_tx_hash,proposal_index,proposal_type,expiration,block_time",
    "title:meta_json->body->>title,abstract:meta_json->body->>abstract"
  ].join(","),
  order: "block_time.desc"
});

/** Koios answered with an error status; `retryAfter` is its `Retry-After`, when sent. */
export class KoiosProposalsError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null) {
    super(`Koios proposal_list failed (${status}).`);
    this.name = "KoiosProposalsError";
  }
}

type KoiosProposal = {
  proposal_id?: unknown;
  proposal_tx_hash?: unknown;
  proposal_index?: unknown;
  proposal_type?: unknown;
  expiration?: unknown;
  title?: unknown;
  abstract?: unknown;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Koios names types in PascalCase (`TreasuryWithdrawals`); the API uses snake case. */
export function snakeCaseProposalType(type: string): string {
  return type.replace(/(?<!^)([A-Z])/g, "_$1").toLowerCase();
}

export function mapKoiosProposal(row: KoiosProposal): GovernanceAction | null {
  const { proposal_id: id, proposal_tx_hash: txHash, proposal_index: index } = row;
  if (typeof id !== "string" || typeof txHash !== "string" || !Number.isSafeInteger(index)) return null;
  return {
    id,
    txHash,
    index: index as number,
    type: typeof row.proposal_type === "string" ? snakeCaseProposalType(row.proposal_type) : "unknown",
    title: asText(row.title),
    abstract: asText(row.abstract),
    expirationEpoch: Number.isSafeInteger(row.expiration) ? (row.expiration as number) : null,
    status: "active"
  };
}

/** Every governance action DReps can still vote on, newest first. */
export async function fetchActiveGovernanceActions(network = CARDANO_NETWORK): Promise<GovernanceAction[]> {
  const response = await fetch(`${koiosBaseUrl(network)}/proposal_list?${ACTIVE_PROPOSALS_QUERY}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    cache: "no-store"
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new KoiosProposalsError(response.status, response.headers.get("Retry-After"));
  }
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Koios proposal_list returned a malformed response.");
  return rows.flatMap((row) => mapKoiosProposal(row as KoiosProposal) ?? []);
}
