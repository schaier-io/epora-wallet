"use client";

import { useAtomValue } from "jotai";
import {
  activeInferredSttStateFormAtom,
  isWalletStakingEnabledAtom,
  lockingContractAtom,
  sttOutputDatumAtom,
  sttProofOfLifeIncrementAtom,
  sttProofOfLifeUnlockTimeAtom,
  totalLockedContractAssetsAtom,
  useAllowancePreviewAtom,
  walletReceiveAddressAtom,
  walletStakingBaseAddressAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";

/**
 * Thin reader over the wallet-derivation DERIVED ATOMS (workspace-wallet-derivations.atoms.ts).
 * The derivations live in the atom graph (computed once); this hook surfaces them for consumers
 * still taking them via ctx. Direct consumers should `useAtomValue` the atoms instead.
 */
export function useWorkspaceWalletDerivations() {
  return {
    activeInferredSttStateForm: useAtomValue(activeInferredSttStateFormAtom),
    useAllowancePreview: useAtomValue(useAllowancePreviewAtom),
    sttOutputDatum: useAtomValue(sttOutputDatumAtom),
    sttProofOfLifeIncrement: useAtomValue(sttProofOfLifeIncrementAtom),
    sttProofOfLifeUnlockTime: useAtomValue(sttProofOfLifeUnlockTimeAtom),
    lockingContract: useAtomValue(lockingContractAtom),
    walletReceiveAddress: useAtomValue(walletReceiveAddressAtom),
    isWalletStakingEnabled: useAtomValue(isWalletStakingEnabledAtom),
    walletStakingBaseAddress: useAtomValue(walletStakingBaseAddressAtom),
    totalLockedContractAssets: useAtomValue(totalLockedContractAssetsAtom)
  };
}
