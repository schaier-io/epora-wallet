// How far an approval request is from having the signatures it needs.
//
// The list row used to say "3 signed" and stop there: a bare count with no idea what it is
// counting towards, so a co-signer could not tell a finished request from one still waiting.
// The threshold is not on the list DTO, but the background pass already fetches each open
// request and runs `verifyProposal`, which computes it from the wallet's on-chain state, but it
// was throwing the result away. These two helpers turn that into one sentence per request,
// and the detail panel uses the same sentence so the two surfaces agree.

import type { ProposalAuthorityPath, SignerSatisfaction } from "@/lib/proposals/types";

export type SignerProgress = {
  label: string;
  /** `ready` = nothing else is needed, the request can be submitted. */
  tone: "ready" | "pending";
};

/** The two operator paths, in the words the rest of the app uses (audit-copy.md §3.2 B, E). */
export function authorityPathLabel(path: ProposalAuthorityPath | string): string {
  if (path === "admin") {
    return "Owner";
  }
  if (path === "multisig") {
    return "Co-signers";
  }
  return path;
}

export function describeSignerProgress(
  signers: SignerSatisfaction | null | undefined,
  signatureCount: number
): SignerProgress {
  // Verification has not landed yet (or failed): fall back to the raw count rather than
  // inventing a total the app cannot see.
  if (!signers) {
    return {
      label: signatureCount === 1 ? "1 signature" : `${signatureCount} signatures`,
      tone: "pending"
    };
  }

  // The multisig path counts weighted power, not people, so a request can be one signature
  // short and still be satisfied, or hold three signatures and not be.
  if (signers.threshold != null) {
    return {
      label: `${signers.satisfiedPower} of ${signers.threshold} approval power`,
      tone: signers.satisfied ? "ready" : "pending"
    };
  }

  return signers.satisfied
    ? { label: "Signed by an owner", tone: "ready" }
    : { label: "Waiting for an owner", tone: "pending" };
}

/** How many of the required signers have not signed yet. Null when the set is unknown. */
export function countOutstandingSigners(
  signers: SignerSatisfaction | null | undefined
): number | null {
  if (!signers || signers.requiredSigners.length === 0) {
    return null;
  }
  const signed = new Set(signers.signedKeyHashes);
  return signers.requiredSigners.filter((signer) => !signed.has(signer.keyHash)).length;
}
