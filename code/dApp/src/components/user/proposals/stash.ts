import { parseJsonSafe, serializeJsonSafe } from "@/lib/proposals/serialization";
import type {
  ProposalAuthorityPath,
  ProposalBuildContext,
  ProposalBuilderKind,
  ProposalSummary
} from "@/lib/proposals/types";

// Hand-off channel between the build flow (workspace "Save as multi-sig
// proposal") and the proposals route's create panel. The draft is stashed in
// sessionStorage rather than passed through navigation state so it survives the
// route change and a refresh, and is serialized with the bigint/Map-safe encoder
// because the build context carries Plutus datum values.

const STASH_KEY = "pw:proposal-draft";

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

export function writeProposalDraft(draft: StashedProposalDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(STASH_KEY, serializeJsonSafe(draft));
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
    return raw ? parseJsonSafe<StashedProposalDraft>(raw) : null;
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
