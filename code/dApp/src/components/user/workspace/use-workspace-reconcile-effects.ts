"use client";
import { type MutableRefObject } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { mintStateFormAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { streamingPaymentPayoutAmountsAtom, sttTransferAmountsAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { transferRecipientModeAtom, transferSelectedUnitAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";

import { useEffect } from "react";

import { type useWalletContext } from "@/providers/wallet-provider";
import { type useWorkspaceTransferDerivations } from "@/components/user/workspace/use-workspace-transfer-derivations";

import { cloneStateForm, safeStringify } from "@/components/user/workspace/helpers";
import { type StateFormState } from "@/lib/contracts/state-form";

/**
 * The form-RECONCILIATION effects, extracted from the controller hook. Each keeps an
 * in-progress form field valid as its available options change (transfer unit/recipient,
 * streaming-payout rows, auto-mint default state) — preserving valid user input, bailing
 * when already consistent. Pure UI reconciliation; no signing. A hook (it owns useEffect),
 * called once from the controller; the ctx spreads the form shapes + 4 derived inputs.
 */
export type WorkspaceReconcileEffectsCtx =
  {
  activeAddress: ReturnType<typeof useWalletContext>["activeAddress"];
  autoMintStateForm: StateFormState;
  availableLockedTransferAssets: ReturnType<typeof useWorkspaceTransferDerivations>["availableLockedTransferAssets"];
  streamingPaymentPayoutRows: ReturnType<typeof useWorkspaceTransferDerivations>["streamingPaymentPayoutRows"];
  previousAutoMintStateRef: MutableRefObject<StateFormState>;
  };

export function useWorkspaceReconcileEffects(ctx: WorkspaceReconcileEffectsCtx): void {
  const {
    activeAddress,
    autoMintStateForm,
    availableLockedTransferAssets,
    previousAutoMintStateRef,
    streamingPaymentPayoutRows
  } = ctx;
  const transferRecipientMode = useAtomValue(transferRecipientModeAtom);
  const transferSelectedUnit = useAtomValue(transferSelectedUnitAtom);
  const setMintStateForm = useSetAtom(mintStateFormAtom);
  const setStreamingPaymentPayoutAmounts = useSetAtom(streamingPaymentPayoutAmountsAtom);
  const setSttTransferAmounts = useSetAtom(sttTransferAmountsAtom);
  const setTransferRecipientMode = useSetAtom(transferRecipientModeAtom);
  const setTransferSelectedUnit = useSetAtom(transferSelectedUnitAtom);

  useEffect(() => {
    // Reconcile-on-change (preserves valid user input); the functional updater
    // returns the same reference when nothing changed, so React bails the update.
     
    setSttTransferAmounts((current) => {
      const next: Record<string, string> = {};

      for (const asset of availableLockedTransferAssets) {
        const currentValue = current[asset.unit];

        if (
          currentValue &&
          /^\d+$/.test(currentValue) &&
          BigInt(currentValue) <= BigInt(asset.quantity)
        ) {
          next[asset.unit] = currentValue;
        } else {
          next[asset.unit] = asset.quantity;
        }
      }

      const sameKeys =
        Object.keys(current).length === Object.keys(next).length &&
        Object.entries(next).every(([unit, quantity]) => current[unit] === quantity);

      return sameKeys ? current : next;
    });
  }, [availableLockedTransferAssets, setSttTransferAmounts]);

  useEffect(() => {
    // Fall back to a custom recipient when "my address" becomes unavailable.
    if (transferRecipientMode === "my-address" && !activeAddress) {
       
      setTransferRecipientMode("custom");
    }
  }, [activeAddress, transferRecipientMode, setTransferRecipientMode]);

  useEffect(() => {
    // Keep the selected transfer unit valid as the available locked assets change.
    if (availableLockedTransferAssets.length === 0) {
      return;
    }

    const hasCurrentUnit = availableLockedTransferAssets.some(
      (asset) => asset.unit === transferSelectedUnit
    );

    if (!hasCurrentUnit) {
      const preferred =
        availableLockedTransferAssets.find((asset) => asset.unit === "lovelace") ??
        availableLockedTransferAssets[0];
       
      setTransferSelectedUnit(preferred?.unit ?? "lovelace");
    }
  }, [availableLockedTransferAssets, transferSelectedUnit, setTransferSelectedUnit]);

  useEffect(() => {
    // Reconcile-on-change (preserves user input); updater bails when unchanged.
     
    setStreamingPaymentPayoutAmounts((current) => {
      const next = streamingPaymentPayoutRows.reduce<Record<string, string>>((accumulator, row) => {
        accumulator[row.streamingPayment.id] = current[row.streamingPayment.id] ?? row.dueAmount;
        return accumulator;
      }, {});
      const sameKeys =
        Object.keys(current).length === Object.keys(next).length &&
        Object.entries(next).every(([key, value]) => current[key] === value);

      return sameKeys ? current : next;
    });
  }, [streamingPaymentPayoutRows, setStreamingPaymentPayoutAmounts]);

  useEffect(() => {
    const previousAutoMintState = previousAutoMintStateRef.current;
    const previousAutoMintStateJson = safeStringify(previousAutoMintState);
    const nextAutoMintStateJson = safeStringify(autoMintStateForm);

    setMintStateForm((current) => {
      const currentJson = safeStringify(current);

      if (currentJson !== previousAutoMintStateJson) {
        return current;
      }

      if (currentJson === nextAutoMintStateJson) {
        return current;
      }

      return cloneStateForm(autoMintStateForm);
    });

    previousAutoMintStateRef.current = cloneStateForm(autoMintStateForm);
  }, [autoMintStateForm, previousAutoMintStateRef, setMintStateForm]);
}
