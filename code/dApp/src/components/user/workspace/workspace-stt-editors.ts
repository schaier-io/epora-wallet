"use client";
import { useAtomValue, useSetAtom } from "jotai";
import { consolidateWalletInputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import { sttExtraTransfersAtom, sttTransferAddressAtom, sttTransferAmountsAtom, sttWalletInputsAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { transferCustomAddressAtom, transferDisplayAmountAtom, transferRecipientModeAtom, transferSelectedUnitAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import { type Dispatch, type SetStateAction } from "react";
import { type useRecentRecipients } from "@/components/user/workspace/use-recent-recipients";

import type { UTxO } from "@meshsdk/core";

import {
  parseAdaToLovelace } from "@/lib/user-flow/guided-helpers";
import { describeAddressProblem } from "@/lib/contracts/payout-address";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import {
  type WalletInputRef } from "@/lib/types/contracts";
import { type useWalletContext } from "@/providers/wallet-provider";
import { type useWorkspaceTransferDerivations } from "@/components/user/workspace/use-workspace-transfer-derivations";

import { DEFAULT_OPTIONAL_CONSTR_PRESET } from "@/components/user/workspace/constants";
import { type SttSpendActionMode } from "@/components/user/workspace/types";

// Which control a staging rejection belongs to, so the view can mark that field rather than
// posting the message to the shared review rail.
export type PayoutRejectionField = "recipient" | "amount" | "asset";

export type PayoutRejection = {
  field: PayoutRejectionField;
  message: string;
};

/**
 * The STT-spend form INPUT/TRANSFER editor handlers, extracted from the controller.
 * They edit the in-progress STT-spend draft: add/seed locked-contract inputs, apply the
 * suggested input selection, and add/update transfer recipients & amounts. The ctx spreads
 * the form-hook return shapes plus the handful of derived values these editors read.
 */
export type WorkspaceSttEditorsCtx = {
  activeAddress: ReturnType<typeof useWalletContext>["activeAddress"];
  availableLockedTransferAssets: ReturnType<typeof useWorkspaceTransferDerivations>["availableLockedTransferAssets"];
  requestedLockedAssetTotals: ReturnType<typeof useWorkspaceTransferDerivations>["requestedLockedAssetTotals"];
  effectiveSttAction: SttSpendActionMode;
  suggestedLockedInputs: ReturnType<typeof useWorkspaceTransferDerivations>["suggestedLockedInputs"];
  setBuildError: Dispatch<SetStateAction<string | null>>;
  setBuildErrorDetails: Dispatch<SetStateAction<string | null>>;
  rememberRecipient: ReturnType<typeof useRecentRecipients>["rememberRecipient"];
  };

export function useWorkspaceSttEditors(ctx: WorkspaceSttEditorsCtx) {
  const {
    activeAddress,
    availableLockedTransferAssets,
    effectiveSttAction,
    requestedLockedAssetTotals,
    setBuildError,
    setBuildErrorDetails,
    suggestedLockedInputs,
    rememberRecipient
  } = ctx;
  const sttTransferAddress = useAtomValue(sttTransferAddressAtom);
  const sttTransferAmounts = useAtomValue(sttTransferAmountsAtom);
  const transferCustomAddress = useAtomValue(transferCustomAddressAtom);
  const transferDisplayAmount = useAtomValue(transferDisplayAmountAtom);
  const transferRecipientMode = useAtomValue(transferRecipientModeAtom);
  const transferSelectedUnit = useAtomValue(transferSelectedUnitAtom);
  const setConsolidateWalletInputs = useSetAtom(consolidateWalletInputsAtom);
  const setSttExtraTransfers = useSetAtom(sttExtraTransfersAtom);
  const setSttTransferAddress = useSetAtom(sttTransferAddressAtom);
  const setSttTransferAmounts = useSetAtom(sttTransferAmountsAtom);
  const setSttWalletInputs = useSetAtom(sttWalletInputsAtom);
  const setTransferCustomAddress = useSetAtom(transferCustomAddressAtom);
  const setTransferDisplayAmount = useSetAtom(transferDisplayAmountAtom);
  const setTransferRecipientMode = useSetAtom(transferRecipientModeAtom);

  function addLockedContractInputRef(utxo: UTxO) {
    const nextRef = {
      txHash: utxo.input.txHash,
      outputIndex: utxo.input.outputIndex
    };

    const appendUniqueRef = (current: WalletInputRef[]) => {
      const alreadyPresent = current.some(
        (ref) => ref.txHash === nextRef.txHash && ref.outputIndex === nextRef.outputIndex
      );

      return alreadyPresent ? current : [...current, nextRef];
    };

    if (effectiveSttAction === "consolidate-utxo") {
      setConsolidateWalletInputs(appendUniqueRef);
    } else {
      setSttWalletInputs(appendUniqueRef);
    }
    setBuildError(null);
    setBuildErrorDetails(null);
  }

  function applySuggestedLockedInputs() {
    if (suggestedLockedInputs.length === 0) {
      setBuildError(
        requestedLockedAssetTotals.length === 0
          ? "Add the recipient and payout amounts first, then the app can suggest which fund pools to use."
          : "No combination of currently loaded locked UTxOs can cover the requested payout amounts."
      );
      setBuildErrorDetails(null);
      return;
    }

    setSttWalletInputs(suggestedLockedInputs);
    setBuildError(null);
    setBuildErrorDetails(null);
  }

  function updateSttTransferAmount(unit: string, nextValue: string, maxQuantity: string) {
    const sanitized = nextValue.replace(/[^\d]/g, "");
    const normalized =
      sanitized.length === 0
        ? "0"
        : BigInt(sanitized) > BigInt(maxQuantity)
          ? maxQuantity
          : sanitized;

    setSttTransferAmounts((current) => ({
      ...current,
      [unit]: normalized
    }));
  }

  function addSttTransferRecipient() {
    const address = sttTransferAddress.trim();
    if (!address) {
      setBuildError("Enter a recipient address before adding a forwarded output.");
      setBuildErrorDetails(null);
      return;
    }

    const nextAmount = availableLockedTransferAssets
      .map((asset) => {
        const requested = sttTransferAmounts[asset.unit] ?? asset.quantity;

        if (!/^\d+$/.test(requested) || BigInt(requested) <= 0n) {
          return null;
        }

        const quantity =
          BigInt(requested) > BigInt(asset.quantity) ? asset.quantity : requested;

        return {
          unit: asset.unit,
          quantity
        };
      })
      .filter((asset): asset is { unit: string; quantity: string } => asset !== null);

    if (nextAmount.length === 0) {
      setBuildError(
        "Select at least one positive asset amount from the selected locked inputs before adding a forwarded output."
      );
      setBuildErrorDetails(null);
      return;
    }

    setSttExtraTransfers((current) => [
      ...current,
      {
        address,
        amount: nextAmount,
        inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET }
      }
    ]);
    setSttTransferAddress("");
    setBuildError(null);
    setBuildErrorDetails(null);
  }

  // Returns the rejection instead of only pushing it to `buildError`. `buildError` renders as
  // the sixth block of the review rail -- a different column on desktop, below the fold at
  // 1440x900 -- so a rejected payout left the field looking accepted while the rail still
  // described the PREVIOUS payout beside an armed `Send funds`. The caller renders what comes
  // back at the field it came from.
  function addSimpleTransferRecipient(): PayoutRejection | null {
    const address =
      transferRecipientMode === "my-address"
        ? activeAddress?.trim() ?? ""
        : transferRecipientMode.startsWith("recent:")
          ? transferRecipientMode.slice("recent:".length).trim()
          : transferCustomAddress.trim();

    if (!address) {
      setBuildError(null);
      setBuildErrorDetails(null);
      return { field: "recipient", message: "Choose a recipient before adding a payout." };
    }

    // Checked before the payout is staged and before `rememberRecipient` persists it: a
    // malformed address that reaches the recent list comes back on later sends.
    const addressProblem = describeAddressProblem(address);
    if (addressProblem) {
      setBuildError(null);
      setBuildErrorDetails(null);
      return { field: "recipient", message: addressProblem };
    }

    const selectedAsset = availableLockedTransferAssets.find(
      (asset) => asset.unit === transferSelectedUnit
    );
    if (!selectedAsset) {
      setBuildError(null);
      setBuildErrorDetails(null);
      return {
        field: "asset",
        message: "No payout asset is available yet. Refresh the wallet or choose fund pools first."
      };
    }

    const normalizedQuantity =
      selectedAsset.unit === "lovelace"
        ? parseAdaToLovelace(transferDisplayAmount)
        : transferDisplayAmount.trim();

    if (!normalizedQuantity || !/^\d+$/.test(normalizedQuantity) || BigInt(normalizedQuantity) <= 0n) {
      setBuildError(null);
      setBuildErrorDetails(null);
      return {
        field: "amount",
        message:
          selectedAsset.unit === "lovelace"
            ? "Enter a positive ADA amount before adding the payout."
            : "Enter a positive asset amount before adding the payout."
      };
    }

    // Say so rather than silently substituting the balance. Quietly rewriting the number
    // leaves the user believing they staged the amount they typed.
    if (BigInt(normalizedQuantity) > BigInt(selectedAsset.quantity)) {
      setBuildError(null);
      setBuildErrorDetails(null);
      return {
        field: "amount",
        message:
          selectedAsset.unit === "lovelace"
            ? `That is more than this wallet holds. ${formatLovelaceAsAda(selectedAsset.quantity)} ₳ is available.`
            : `That is more than this wallet holds. ${selectedAsset.quantity} is available.`
      };
    }

    setSttExtraTransfers((current) => [
      ...current,
      {
        address,
        amount: [{ unit: selectedAsset.unit, quantity: normalizedQuantity }],
        inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET }
      }
    ]);
    setTransferDisplayAmount("");
    if (transferRecipientMode === "custom") {
      rememberRecipient(address);
      setTransferCustomAddress("");
      setTransferRecipientMode("");
    }
    setBuildError(null);
    setBuildErrorDetails(null);
    return null;
  }

  return {
    addLockedContractInputRef,
    applySuggestedLockedInputs,
    updateSttTransferAmount,
    addSttTransferRecipient,
    addSimpleTransferRecipient
  };
}
