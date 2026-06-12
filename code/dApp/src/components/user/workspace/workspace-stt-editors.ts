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
import {
  type WalletInputRef } from "@/lib/types/contracts";
import { type useWalletContext } from "@/providers/wallet-provider";
import { type useWorkspaceTransferDerivations } from "@/components/user/workspace/use-workspace-transfer-derivations";

import { DEFAULT_OPTIONAL_CONSTR_PRESET } from "@/components/user/workspace/constants";
import { type SttSpendActionMode } from "@/components/user/workspace/types";

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

  function addSimpleTransferRecipient() {
    const address =
      transferRecipientMode === "my-address"
        ? activeAddress?.trim() ?? ""
        : transferRecipientMode.startsWith("recent:")
          ? transferRecipientMode.slice("recent:".length).trim()
          : transferCustomAddress.trim();

    if (!address) {
      setBuildError("Choose a recipient before adding a payout.");
      setBuildErrorDetails(null);
      return;
    }

    const selectedAsset = availableLockedTransferAssets.find(
      (asset) => asset.unit === transferSelectedUnit
    );
    if (!selectedAsset) {
      setBuildError("No payout asset is available yet. Refresh the wallet or choose fund pools first.");
      setBuildErrorDetails(null);
      return;
    }

    const normalizedQuantity =
      selectedAsset.unit === "lovelace"
        ? parseAdaToLovelace(transferDisplayAmount)
        : transferDisplayAmount.trim();

    if (!normalizedQuantity || !/^\d+$/.test(normalizedQuantity) || BigInt(normalizedQuantity) <= 0n) {
      setBuildError(
        selectedAsset.unit === "lovelace"
          ? "Enter a positive ADA amount before adding the payout."
          : "Enter a positive asset amount before adding the payout."
      );
      setBuildErrorDetails(null);
      return;
    }

    const boundedQuantity =
      BigInt(normalizedQuantity) > BigInt(selectedAsset.quantity)
        ? selectedAsset.quantity
        : normalizedQuantity;

    setSttExtraTransfers((current) => [
      ...current,
      {
        address,
        amount: [{ unit: selectedAsset.unit, quantity: boundedQuantity }],
        inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET }
      }
    ]);
    setTransferDisplayAmount("");
    if (transferRecipientMode === "custom") {
      rememberRecipient(address);
      setTransferCustomAddress("");
      setTransferRecipientMode(activeAddress ? "my-address" : "custom");
    }
    setBuildError(null);
    setBuildErrorDetails(null);
  }

  return {
    addLockedContractInputRef,
    applySuggestedLockedInputs,
    updateSttTransferAmount,
    addSttTransferRecipient,
    addSimpleTransferRecipient
  };
}
