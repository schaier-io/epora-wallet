/**
 * The wallet-publish payload is one Mesh `CertificateType` (`publishCertificateJsonAtom`).
 * The voting-delegate picker writes it from a choice and reads it back, so the JSON stays
 * the one source of truth that validation, the builder and the co-signing request read.
 *
 * Shapes from `@meshsdk/common` 1.9.1 `index.d.ts`: `VoteDelegation` (339),
 * `VoteRegistrationAndDelegation` (353, `coin` is the stake key deposit) and `DRep` (385).
 */

export type DelegateChoice =
  | { kind: "drep"; drepId: string }
  | { kind: "alwaysAbstain" }
  | { kind: "alwaysNoConfidence" };

/** A registered address only delegates; an unregistered one registers in the same certificate. */
export type StakeRegistration = { registered: true } | { registered: false; depositLovelace: number };

export type SavedDelegation = { choice: DelegateChoice; registers: boolean; stakeKeyAddress: string };

function drepOf(choice: DelegateChoice) {
  if (choice.kind === "drep") return { dRepId: choice.drepId };
  return choice.kind === "alwaysAbstain" ? { alwaysAbstain: null } : { alwaysNoConfidence: null };
}

export function buildVoteDelegationJson(
  stakeKeyAddress: string,
  choice: DelegateChoice,
  registration: StakeRegistration
): string {
  const certificate = registration.registered
    ? { type: "VoteDelegation", stakeKeyAddress, drep: drepOf(choice) }
    : {
        type: "VoteRegistrationAndDelegation",
        stakeKeyAddress,
        drep: drepOf(choice),
        coin: registration.depositLovelace
      };
  return JSON.stringify(certificate, null, 2);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readChoice(drep: Record<string, unknown> | null): DelegateChoice | null {
  if (!drep) return null;
  if (typeof drep.dRepId === "string" && drep.dRepId.trim()) return { kind: "drep", drepId: drep.dRepId.trim() };
  if ("alwaysAbstain" in drep) return { kind: "alwaysAbstain" };
  if ("alwaysNoConfidence" in drep) return { kind: "alwaysNoConfidence" };
  return null;
}

/** The delegation a payload names, or null when it is not a complete voting delegation. */
export function readVoteDelegationJson(json: string): SavedDelegation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const root = record(parsed);
  const registers = root?.type === "VoteRegistrationAndDelegation";
  if (root?.type !== "VoteDelegation" && !registers) return null;
  if (typeof root.stakeKeyAddress !== "string" || !root.stakeKeyAddress) return null;
  if (registers && (typeof root.coin !== "number" || !Number.isSafeInteger(root.coin) || root.coin < 0)) return null;
  const choice = readChoice(record(root.drep));
  return choice ? { choice, registers, stakeKeyAddress: root.stakeKeyAddress } : null;
}
