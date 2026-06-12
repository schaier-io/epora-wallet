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
        error: "Connect a wallet with a payment key hash before building Allowance Withdrawal."
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
            `Locked input ${walletInputRef.txHash}#${walletInputRef.outputIndex} is not loaded in the current wallet UTxO set. Refresh locked UTxOs or remove that row.`
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
        error:
          error instanceof Error
            ? error.message
            : "Unable to derive the Allowance Withdrawal target user and output state."
      };
    }
}
