"use client";

import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import type { UTxO } from "@meshsdk/core";

import {
  stateFormToDatum,
  type StateFormState
} from "@/lib/contracts/state-form";

import {
  deriveAllowanceWithdrawalStateDatum,
  AllowanceDerivationError,
  type AllowanceWithdrawalComputation,
  type AllowanceWithdrawalTarget
} from "@/lib/contracts/use-allowance";
import {
  type DetectedSttToken
} from "@/lib/mesh/detection";
import { getValidityWindow } from "@/lib/mesh/transactions";

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
        error: i18n("connectAWalletBeforeYouContinueSendingFrom")
      };
    }

    const serializedTransfers = serializeTransfers(sttExtraTransfers);
    if (serializedTransfers.length === 0) {
      // Before anything is staged the derivation would only fail on the missing
      // transfer; that reads as a resolver error, so say what is actually next.
      return {
        computation: null,
        target: null,
        error: i18n("addAPayoutToSeeTheLimit")
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
      const walletInputAmounts = sttWalletInputs.map((walletInputRef) => {
        const resolved = findMatchingLockedUtxo(lockedContractUtxos, walletInputRef);

        if (!resolved) {
          throw new AllowanceDerivationError(
            `Fund pool ${walletInputRef.txHash}#${walletInputRef.outputIndex} is not loaded yet. Refresh the wallet's funds, or remove that row.`
          );
        }

        return resolved.output.amount;
      });

      const validityWindow = getValidityWindow();

      const computation = deriveAllowanceWithdrawalStateDatum({
        stateDatum: sourceDatum,
        allowanceSignerKeyHash: activePaymentKeyHash,
        walletInputAmounts,
        walletOutputs: serializedWalletOutputs,
        extraTransfers: serializedTransfers,
        // The builder's own window, so the preview and the transaction it
        // previews agree down to the slot. The reset decision is anchored to
        // the lower (earliest) bound on-chain.
        txEarliestTimeMs: validityWindow.earliestTimeMs,
        txLatestTimeMs: validityWindow.latestTimeMs
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
      if (error instanceof AllowanceDerivationError) {
        return { computation: null, target: null, error: error.message };
      }

      return {
        computation: null,
        target: null,
        error: getUserFacingErrorMessage(error, i18n("couldNotWorkOutWhichSpenderThisSend"))
      };
    }
}
