"use client";

import { useEffect } from "react";

import type {
  UserActionKind
} from "@/components/user/flow-types";

import { type useWorkspaceTransferDerivations } from "@/components/user/workspace/use-workspace-transfer-derivations";
import { subtractAmountLists } from "@/components/user/workspace/helpers/asset-amounts";

import { type useSttSpendForm } from "@/components/user/workspace/forms/use-stt-spend-form";
import { type useLockedContractUtxos } from "@/components/user/workspace/use-locked-contract-utxos";

function isSendAction(selectedAction: UserActionKind): boolean {
  return selectedAction === "use" ||
    selectedAction === "use-allowance" ||
    selectedAction === "use-beneficiary";
}

/**
 * Refreshes fund pools when a send flow opens. It also seeds suggested wallet inputs after
 * the reader adds a payout. These effects prepare draft state only and never sign.
 */
export interface WorkspaceSendActionEffectsCtx {
  lockingContractAddress: string | null;
  refreshLockedContractUtxos: ReturnType<typeof useLockedContractUtxos>["refreshLockedContractUtxos"];
  selectedAction: UserActionKind;
  wizardSelectedAction: UserActionKind | null;
  sttExtraTransfers: ReturnType<typeof useSttSpendForm>["sttExtraTransfers"];
  sttWalletInputs: ReturnType<typeof useSttSpendForm>["sttWalletInputs"];
  setSttWalletInputs: ReturnType<typeof useSttSpendForm>["setSttWalletInputs"];
  suggestedLockedInputs: ReturnType<typeof useWorkspaceTransferDerivations>["suggestedLockedInputs"];
  selectedLockedContractAssets: ReturnType<typeof useWorkspaceTransferDerivations>["selectedLockedContractAssets"];
  requestedLockedAssetTotals: ReturnType<typeof useWorkspaceTransferDerivations>["requestedLockedAssetTotals"];
}

export function useWorkspaceSendActionEffects(ctx: WorkspaceSendActionEffectsCtx): void {
  const {
    lockingContractAddress,
    refreshLockedContractUtxos,
    selectedAction,
    wizardSelectedAction,
    sttExtraTransfers,
    sttWalletInputs,
    setSttWalletInputs,
    suggestedLockedInputs,
    selectedLockedContractAssets,
    requestedLockedAssetTotals
  } = ctx;
  // A later, larger payout can outgrow the pools seeded for the first one. The
  // builder then refuses the draft, so replace a pick that no longer covers the
  // staged payouts. A pick that still covers them is the reader's and stays.
  const selectionCoversRequest =
    subtractAmountLists(requestedLockedAssetTotals, selectedLockedContractAssets).length === 0;

  useEffect(() => {
    if (
      wizardSelectedAction &&
      isSendAction(wizardSelectedAction) &&
      lockingContractAddress
    ) {
      void refreshLockedContractUtxos(lockingContractAddress, { retryEmpty: true, preserveRecovery: true });
    }
  }, [lockingContractAddress, refreshLockedContractUtxos, wizardSelectedAction]);

  useEffect(() => {
    if (
      isSendAction(selectedAction) &&
      sttExtraTransfers.length > 0 &&
      (sttWalletInputs.length === 0 || !selectionCoversRequest) &&
      suggestedLockedInputs.length > 0
    ) {
      setSttWalletInputs(suggestedLockedInputs);
    }
  }, [
    selectedAction,
    sttExtraTransfers.length,
    sttWalletInputs.length,
    selectionCoversRequest,
    suggestedLockedInputs,
    setSttWalletInputs
  ]);
}
