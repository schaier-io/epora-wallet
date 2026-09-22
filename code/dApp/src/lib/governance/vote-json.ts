/**
 * The wallet-vote payload is Mesh's `VoteType` JSON (`voteJsonAtom`). The vote picker
 * writes it from a looked-up governance action and a Yes/No/Abstain choice, and reads it
 * back, so the JSON stays the one source of truth that validation and the builder read.
 */

export const VOTE_KINDS = ["Yes", "No", "Abstain"] as const;
export type VoteKind = (typeof VOTE_KINDS)[number];

export type VoteChoice = { txHash: string; txIndex: number; voteKind: VoteKind };

const TX_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function buildVoteJson(drepId: string, choice: VoteChoice): string {
  return JSON.stringify(
    {
      voter: { type: "DRep", drepId },
      govActionId: { txHash: choice.txHash, txIndex: choice.txIndex },
      votingProcedure: { voteKind: choice.voteKind }
    },
    null,
    2
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** The action and vote kind a payload names, or null when it names no complete vote. */
export function readVoteJson(json: string): VoteChoice | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const root = record(parsed);
  const actionId = record(root?.govActionId);
  const txHash = typeof actionId?.txHash === "string" ? actionId.txHash.toLowerCase() : "";
  const txIndex = actionId?.txIndex;
  const voteKind = record(root?.votingProcedure)?.voteKind;
  if (!TX_HASH_PATTERN.test(txHash)) return null;
  if (typeof txIndex !== "number" || !Number.isSafeInteger(txIndex) || txIndex < 0) return null;
  if (!VOTE_KINDS.includes(voteKind as VoteKind)) return null;
  return { txHash, txIndex, voteKind: voteKind as VoteKind };
}

/**
 * The governance action id inside whatever the user pasted: a bare `gov_action1…` id, a
 * `<tx hash>#<index>` pair, or an explorer link that contains either one.
 */
export function extractGovernanceActionId(text: string): string | null {
  const bech32 = /gov_action1[02-9ac-hj-np-z]+/.exec(text.toLowerCase());
  if (bech32) return bech32[0];
  const txRef = /([0-9a-f]{64})(?:#|%23)(\d{1,5})/i.exec(text);
  return txRef ? `${txRef[1].toLowerCase()}#${Number(txRef[2])}` : null;
}
