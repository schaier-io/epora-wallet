"use client";

import { useAtom } from "jotai";
import { withdrawRewardAddressAtom, withdrawAmountAtom, selectedStakePoolAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom, withdrawSttStateFormAtom, withdrawZeroAdminConfirmedAtom, withdrawSttAssetsAtom } from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";

/**
 * Form state for the wallet-withdraw (rewards / de-registration) action and the
 * STT context it spends. One cohesive slice so the controller composes it rather
 * than owning the raw `useState` calls.
 */
export function useWithdrawForm() {
  const [withdrawRewardAddress, setWithdrawRewardAddress] = useAtom(withdrawRewardAddressAtom);
  const [withdrawAmount, setWithdrawAmount] = useAtom(withdrawAmountAtom);
  // Stake pool the user picked to delegate to (via the Find-your-pool finder).
  const [selectedStakePool, setSelectedStakePool] = useAtom(selectedStakePoolAtom);
  const [withdrawSttInputHash, setWithdrawSttInputHash] = useAtom(withdrawSttInputHashAtom);
  const [withdrawSttInputIndex, setWithdrawSttInputIndex] = useAtom(withdrawSttInputIndexAtom);
  const [withdrawSttStateForm, setWithdrawSttStateForm] = useAtom(withdrawSttStateFormAtom);
  const [withdrawZeroAdminConfirmed, setWithdrawZeroAdminConfirmed] = useAtom(withdrawZeroAdminConfirmedAtom);
  const [withdrawSttAssets, setWithdrawSttAssets] = useAtom(withdrawSttAssetsAtom);

  return {
    withdrawRewardAddress,
    setWithdrawRewardAddress,
    withdrawAmount,
    setWithdrawAmount,
    selectedStakePool,
    setSelectedStakePool,
    withdrawSttInputHash,
    setWithdrawSttInputHash,
    withdrawSttInputIndex,
    setWithdrawSttInputIndex,
    withdrawSttStateForm,
    setWithdrawSttStateForm,
    withdrawZeroAdminConfirmed,
    setWithdrawZeroAdminConfirmed,
    withdrawSttAssets,
    setWithdrawSttAssets
  };
}
