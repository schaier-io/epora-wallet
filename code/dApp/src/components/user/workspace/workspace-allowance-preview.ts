"use client";

import type { UTxO } from "@meshsdk/core";

import {
  stateFormToDatum,
  type StateFormState
} from "@/lib/contracts/state-form";

import {
  deriveAllowanceWithdrawalStateDatum,
  type AllowanceWithdrawalComputation,
  type AllowanceWithdrawalTarget
} from "@/lib/contracts/use-allowance";
import {
  type DetectedSttToken
} from "@/lib/mesh/detection";

import {
  type WalletInputRef } from "@/lib/types/contracts";
import { cloneStateForm, findMatchingLockedUtxo, resolveOperatorActionAlternative, serializeTransfers, serializeWalletOutputs } from "@/components/user/workspace/helpers";
import { type SttSpendActionMode, type TransferFormState, type WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceAllowancePreview.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceAllowancePreview", defaultMessages);

export interface AllowancePreviewParams {
  effectiveSttAction: SttSpendActionMode;
  activePaymentKeyHash: string | null;
  selectedDetectedToken: DetectedSttToken | null;
  activeInferredSttStateForm: StateFormState;
  sttWalletOutputs: WalletScriptOutputFormState[];
  sttExtraTransfers: TransferFormState[];
  sttWalletInputs: WalletInputRef[];
  lockedContractUtxos: UTxO[];
}

export interface AllowancePreviewResult {
  computation: AllowanceWithdrawalComputation | null;
  target: AllowanceWithdrawalTarget | null;
  error: string | null;
}

function formatAllowancePreviewError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("not loaded in the current wallet UTxO set")) {
    return i18n("aSelectedFundPoolIsNoLongerAvailable");
  }
  if (message.includes("requires at least one positive forwarded transfer")) {
    return i18n("addAtLeastOneRecipientAndAmount");
  }
  if (message.includes("multiple user records")) {
    return i18n("thisSignerMatchesMoreThanOneSpenderUse");
  }
  if (message.includes("does not match any allowance user")) {
    return i18n("thisSignerDoesNotHaveEnoughAllowanceFor");
  }
  if (
    message.includes("exceeds the available remaining allowance") ||
    message.includes("outside the matched user's allowance")
  ) {
    return i18n("thisPaymentExceedsTheSpenderSAvailableAllowance");
  }
  if (message.includes("Requested locked-fund usage")) {
    return i18n("theSelectedFundPoolsDoNotCoverThis");
  }

  return i18n("unableToCalculateThisAllowanceRefreshTheWallet");
}

export function computeAllowancePreview(params: AllowancePreviewParams): AllowancePreviewResult {
  const {
    effectiveSttAction,
    activePaymentKeyHash,
    selectedDetectedToken,
    activeInferredSttStateForm,
    sttWalletOutputs,
    sttExtraTransfers,
    sttWalletInputs,
    lockedContractUtxos
  } = params;
    if (effectiveSttAction !== "use-allowance") {
      return { computation: null, target: null, error: null };
    }

    if (!activePaymentKeyHash) {
      return {
        computation: null,
        target: null,
        error: i18n("connectTheSignerThatHasThisSpendingAllowance")
      };
    }

    try {
      const sourceDatum =
        selectedDetectedToken?.datum ??
        stateFormToDatum(
          cloneStateForm(activeInferredSttStateForm),
          resolveOperatorActionAlternative("admin")
        );
      const serializedWalletOutputs = serializeWalletOutputs(sttWalletOutputs);
      const serializedTransfers = serializeTransfers(sttExtraTransfers);
      const walletInputAmounts = sttWalletInputs.map((walletInputRef) => {
        const resolved = findMatchingLockedUtxo(lockedContractUtxos, walletInputRef);

        if (!resolved) {
          throw new Error(
            i18n("selectedFundPoolValue1Value2IsNotLoaded", {
              value1: walletInputRef.txHash,
              value2: walletInputRef.outputIndex
            })
          );
        }

        return resolved.output.amount;
      });

      const computation = deriveAllowanceWithdrawalStateDatum({
        stateDatum: sourceDatum,
        allowanceSignerKeyHash: activePaymentKeyHash,
        walletInputAmounts,
        walletOutputs: serializedWalletOutputs,
        extraTransfers: serializedTransfers,
        // Bounds mirror getValidityWindow's reference offsets; the reset
        // decision is anchored to the lower (earliest) bound on-chain.
        txEarliestTimeMs: Date.now() - 120000,
        txLatestTimeMs: Date.now() + 240000
      });

      const target: AllowanceWithdrawalTarget = {
        matchedUserId: computation.matchedUserId,
        matchedUserIndex: computation.matchedUserIndex,
        matchedUserWallets: computation.matchedUserWallets,
        effectiveRemainingAllowance: computation.effectiveRemainingAllowance,
        currentRemainingAllowance: computation.currentRemainingAllowance,
        nextAllowanceReset: computation.nextAllowanceReset
      };

      return { computation, target, error: null };
    } catch (error) {
      return {
        computation: null,
        target: null,
        error: formatAllowancePreviewError(error)
      };
    }
}
