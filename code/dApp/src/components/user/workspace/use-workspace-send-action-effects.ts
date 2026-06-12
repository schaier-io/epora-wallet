"use client";

import { useEffect } from "react";

import type {
  UserActionKind
} from "@/components/user/flow-types";

import { type useWorkspaceTransferDerivations } from "@/components/user/workspace/use-workspace-transfer-derivations";

import { type useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";

/**
 * The send-action default-funding effect, extracted from the controller hook. When the
 * active action is a send/use flow with no wallet inputs chosen yet, it seeds the STT wallet
 * inputs from the suggested locked inputs so the draft starts funded. Draft state only; no
 * signing. A hook (owns useEffect), called once from the controller.
 */
export interface WorkspaceSendActionEffectsCtx {
  selectedAction: UserActionKind;
  sttExtraTransfers: ReturnType<typeof useSttSpendForm>["sttExtraTransfers"];
  sttWalletInputs: ReturnType<typeof useSttSpendForm>["sttWalletInputs"];
  setSttWalletInputs: ReturnType<typeof useSttSpendForm>["setSttWalletInputs"];
  suggestedLockedInputs: ReturnType<typeof useWorkspaceTransferDerivations>["suggestedLockedInputs"];
}

export function useWorkspaceSendActionEffects(ctx: WorkspaceSendActionEffectsCtx): void {
  const {
    selectedAction,
    sttExtraTransfers,
    sttWalletInputs,
    setSttWalletInputs,
    suggestedLockedInputs
  } = ctx;

  useEffect(() => {
    const isSendAction =
      selectedAction === "use" ||
      selectedAction === "use-allowance" ||
      selectedAction === "use-beneficiary";
    if (
      isSendAction &&
      sttExtraTransfers.length > 0 &&
      sttWalletInputs.length === 0 &&
      suggestedLockedInputs.length > 0
    ) {

      setSttWalletInputs(suggestedLockedInputs);
    }
  }, [
    selectedAction,
    sttExtraTransfers.length,
    sttWalletInputs.length,
    suggestedLockedInputs,
    setSttWalletInputs
  ]);
}
