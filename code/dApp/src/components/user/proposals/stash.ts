import { parseJsonSafe, serializeJsonSafe } from "@/lib/proposals/serialization";
import type {
  ProposalAuthorityPath,
  ProposalBuildContext,
  ProposalBuilderKind,
  ProposalSummary
} from "@/lib/proposals/types";

// Hand-off channel between the build flow (workspace "Save as approval
// request") and the proposals route's create panel. The draft is stashed in
// sessionStorage rather than passed through navigation state so it survives the
// route change and a refresh, and is serialized with the bigint/Map-safe encoder
// because the build context carries Plutus datum values.

const STASH_KEY = "pw:proposal-draft";

// Bump when the draft shape below changes. sessionStorage outlives a deploy
// inside the same tab, so a draft written by an older build is read back by a
// newer one. The read used to cast whatever it found, which handed the create
// panel an object missing fields it depends on, and the panel failed on a value
// it could not have produced. An unrecognised draft is dropped instead.
const STASH_VERSION = 1;

export type StashedProposalDraft = {
  walletUnit: string;
  walletPolicyId: string;
  actionKind: string;
  authorityPath: ProposalAuthorityPath;
  builder: ProposalBuilderKind;
  buildContext: ProposalBuildContext;
  unsignedTxHex: string;
  summary?: ProposalSummary;
  suggestedTitle?: string;
};

function isStashedProposalDraft(value: unknown): value is StashedProposalDraft {
  if (!value || typeof value !== "object") {
    return false;
  }
  const draft = value as Partial<StashedProposalDraft>;
  return (
    typeof draft.walletUnit === "string" &&
    typeof draft.walletPolicyId === "string" &&
    typeof draft.actionKind === "string" &&
    typeof draft.authorityPath === "string" &&
    typeof draft.builder === "string" &&
    typeof draft.unsignedTxHex === "string" &&
    typeof draft.buildContext === "object" &&
    draft.buildContext !== null
  );
}

export function writeProposalDraft(draft: StashedProposalDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      STASH_KEY,
      serializeJsonSafe({ version: STASH_VERSION, draft })
    );
  } catch {
    // sessionStorage may be unavailable (private mode); the create flow simply
    // shows an empty state in that case.
  }
}

export function readProposalDraft(): StashedProposalDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) {
      return null;
    }
    const stored = parseJsonSafe<{ version?: unknown; draft?: unknown }>(raw);
    if (!stored || stored.version !== STASH_VERSION || !isStashedProposalDraft(stored.draft)) {
      return null;
    }
    return stored.draft;
  } catch {
    return null;
  }
}

export function clearProposalDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(STASH_KEY);
  } catch {
    // ignore
  }
}

// What the workspace captures at build time for a proposable action. The
// transaction hex is added at stash time (it is the build result), keeping the
// per-build capture in the god-component to a single object assignment.
export type ProposalCapture = {
  actionKind: string;
  authorityPath: ProposalAuthorityPath;
  builder: ProposalBuilderKind;
  buildContext: ProposalBuildContext;
  walletUnit: string;
  walletPolicyId: string;
  summary?: ProposalSummary;
};

export function stashCaptureForBuild(capture: ProposalCapture, unsignedTxHex: string): void {
  writeProposalDraft({
    walletUnit: capture.walletUnit,
    walletPolicyId: capture.walletPolicyId,
    actionKind: capture.actionKind,
    authorityPath: capture.authorityPath,
    builder: capture.builder,
    buildContext: capture.buildContext,
    unsignedTxHex,
    summary: capture.summary
  });
}
