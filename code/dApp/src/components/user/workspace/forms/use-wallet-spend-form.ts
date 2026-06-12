"use client";

import { useAtom } from "jotai";
import { walletSpendInputHashAtom, walletSpendInputIndexAtom, walletSpendRedeemerPresetAtom, walletSpendOutputsAtom } from "@/components/user/workspace/atoms/forms/wallet-spend-form.atoms";

/**
 * Form state for the raw wallet-spend action (input ref + redeemer preset + outputs).
 */
export function useWalletSpendForm() {
  const [walletSpendInputHash, setWalletSpendInputHash] = useAtom(walletSpendInputHashAtom);
  const [walletSpendInputIndex, setWalletSpendInputIndex] = useAtom(walletSpendInputIndexAtom);
  const [walletSpendRedeemerPreset, setWalletSpendRedeemerPreset] = useAtom(walletSpendRedeemerPresetAtom);
  const [walletSpendOutputs, setWalletSpendOutputs] = useAtom(walletSpendOutputsAtom);

  return {
    walletSpendInputHash,
    setWalletSpendInputHash,
    walletSpendInputIndex,
    setWalletSpendInputIndex,
    walletSpendRedeemerPreset,
    setWalletSpendRedeemerPreset,
    walletSpendOutputs,
    setWalletSpendOutputs
  };
}
