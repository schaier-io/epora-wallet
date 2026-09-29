"use client";

import { useEffect, useRef } from "react";

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
  // A later, larger payout can outgrow the pools seeded for the first one, and a
  // refresh can drop a picked UTxO. The builder then refuses the draft, so a pick
  // that no longer covers the staged payouts is replaced. Only a change the
  // reader did not make triggers this: a new request, or a coverage change while
  // the pick stayed the same. A reader who unchecks one pool to swap in another
  // is short for a moment, and that edit must not snap back.
  const selectionCoversRequest =
    subtractAmountLists(requestedLockedAssetTotals, selectedLockedContractAssets).length === 0;
  const requestKey = JSON.stringify(requestedLockedAssetTotals);
  const pickKey = JSON.stringify(sttWalletInputs);
  const coverageKey = JSON.stringify(selectedLockedContractAssets);
  const seen = useRef<{ request: string; pick: string; coverage: string } | null>(null);
  // Set by a change the reader did not make; cleared only once a suggestion can
  // be applied, so a change that lands during a reload is not lost.
  const recheckCoverage = useRef(false);

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
    const previous = seen.current;
    if (!previous || previous.request !== requestKey ||
        (previous.pick === pickKey && previous.coverage !== coverageKey)) {
      recheckCoverage.current = true;
    } else if (previous.pick !== pickKey) {
      // A pure reader edit is newer than any change still waiting for a suggestion.
      recheckCoverage.current = false;
    }
    seen.current = { request: requestKey, pick: pickKey, coverage: coverageKey };
    if (
      !isSendAction(selectedAction) ||
      sttExtraTransfers.length === 0 ||
      suggestedLockedInputs.length === 0
    ) {
      return;
    }
    if (sttWalletInputs.length === 0 || (recheckCoverage.current && !selectionCoversRequest)) {
      setSttWalletInputs(suggestedLockedInputs);
    }
    recheckCoverage.current = false;
  }, [
    selectedAction,
    sttExtraTransfers.length,
    sttWalletInputs.length,
    selectionCoversRequest,
    requestKey,
    pickKey,
    coverageKey,
    suggestedLockedInputs,
    setSttWalletInputs
  ]);
}
