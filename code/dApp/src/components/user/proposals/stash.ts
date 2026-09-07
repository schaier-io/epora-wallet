import { parseJsonSafe, serializeJsonSafe } from "@/lib/proposals/serialization";
import type { StateFormState } from "@/lib/contracts/state-form";
import type {
  ProposalAuthorityPath,
  ProposalBuildContext,
  ProposalBuilderKind,
  ProposalSummary
} from "@/lib/proposals/types";
import { fitProposalSummaryForStorage } from "@/lib/proposals/summary";

export { fitProposalSummaryForStorage } from "@/lib/proposals/summary";

// Hand-off channel between the build flow (workspace "Save as approval
// request") and the proposals route's create panel. The draft is stashed in
// sessionStorage rather than passed through navigation state so it survives the
// route change and a refresh, and is serialized with the bigint/Map-safe encoder
// because the build context carries Plutus datum values.

const STASH_KEY = "pw:proposal-draft";
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
  // The builder's payment key hash and the wallet state the transaction consumes,
  // so the create form can offer the other signers and check the chosen set
  // against the wallet's rule before the transaction is rebuilt with them listed.
  proposerKeyHash?: string;
  stateForm?: StateFormState;
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
      serializeJsonSafe({
        version: STASH_VERSION,
        draft: {
          ...draft,
          summary: draft.summary ? fitProposalSummaryForStorage(draft.summary) : undefined
        }
      })
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
    if (!raw) return null;
    const stored = parseJsonSafe<{ version?: unknown; draft?: unknown }>(raw);
    return stored?.version === STASH_VERSION && isStashedProposalDraft(stored.draft)
      ? stored.draft
      : null;
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
  proposerKeyHash?: string;
  stateForm?: StateFormState;
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
    summary: capture.summary,
    proposerKeyHash: capture.proposerKeyHash,
    stateForm: capture.stateForm
  });
}
