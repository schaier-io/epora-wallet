"use client";

import { useAtom } from "jotai";
import { transferRecipientModeAtom, transferCustomAddressAtom, transferSelectedUnitAtom, transferDisplayAmountAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";

/**
 * Form state for the guided simple-transfer composer (recipient + asset + amount).
 */
export function useTransferForm() {
  const [transferRecipientMode, setTransferRecipientMode] = useAtom(transferRecipientModeAtom);
  const [transferCustomAddress, setTransferCustomAddress] = useAtom(transferCustomAddressAtom);
  const [transferSelectedUnit, setTransferSelectedUnit] = useAtom(transferSelectedUnitAtom);
  const [transferDisplayAmount, setTransferDisplayAmount] = useAtom(transferDisplayAmountAtom);

  return {
    transferRecipientMode,
    setTransferRecipientMode,
    transferCustomAddress,
    setTransferCustomAddress,
    transferSelectedUnit,
    setTransferSelectedUnit,
    transferDisplayAmount,
    setTransferDisplayAmount
  };
}
