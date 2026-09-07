import type { ProposalCapture } from "@/components/user/proposals/stash";
import { cloneStateForm } from "@/components/user/workspace/helpers";
import type { StateFormState } from "@/lib/contracts/state-form";
import type { ProposalAuthorityPath, ProposalBuildContext } from "@/lib/proposals/types";
import type { MutableRefObject } from "react";

type ProposalCaptureWriterInput = {
  activePaymentKeyHash: string | null;
  proposalCaptureRef: MutableRefObject<ProposalCapture | null>;
  stateForm: StateFormState;
  walletAssetNameHex: string;
  walletPolicyId?: string;
};

export function createProposalCaptureWriter({
  activePaymentKeyHash,
  proposalCaptureRef,
  stateForm,
  walletAssetNameHex,
  walletPolicyId
}: ProposalCaptureWriterInput) {
  return (
    actionKind: string,
    authorityPath: ProposalAuthorityPath,
    buildContext: ProposalBuildContext
  ) => {
    if (!walletPolicyId || !walletAssetNameHex) {
      return;
    }

    proposalCaptureRef.current = {
      actionKind,
      authorityPath,
      builder: buildContext.builder,
      buildContext,
      walletUnit: `${walletPolicyId}${walletAssetNameHex}`,
      walletPolicyId,
      proposerKeyHash: activePaymentKeyHash ?? undefined,
      stateForm: cloneStateForm(stateForm)
    };
  };
}
