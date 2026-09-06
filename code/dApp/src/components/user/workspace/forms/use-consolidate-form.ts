"use client";

import { useAtom } from "jotai";
import { beneficiaryPreparationActiveAtom, beneficiaryPreparationPoolAssetsAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateStateFormAtom, consolidateSttAssetsAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";

/**
 * Form state for the consolidate-orphans action and the STT context it spends.
 */
export function useConsolidateForm() {
  const [beneficiaryPreparationActive, setBeneficiaryPreparationActive] = useAtom(beneficiaryPreparationActiveAtom);
  const [beneficiaryPreparationPoolAssets, setBeneficiaryPreparationPoolAssets] = useAtom(beneficiaryPreparationPoolAssetsAtom);
  const [consolidateSttInputHash, setConsolidateSttInputHash] = useAtom(consolidateSttInputHashAtom);
  const [consolidateSttInputIndex, setConsolidateSttInputIndex] = useAtom(consolidateSttInputIndexAtom);
  const [consolidateStateForm, setConsolidateStateForm] = useAtom(consolidateStateFormAtom);
  const [consolidateSttAssets, setConsolidateSttAssets] = useAtom(consolidateSttAssetsAtom);
  const [consolidateWalletInputs, setConsolidateWalletInputs] = useAtom(consolidateWalletInputsAtom);
  const [consolidateWalletOutputs, setConsolidateWalletOutputs] = useAtom(consolidateWalletOutputsAtom);

  return {
    beneficiaryPreparationActive, setBeneficiaryPreparationActive, beneficiaryPreparationPoolAssets, setBeneficiaryPreparationPoolAssets,
    consolidateSttInputHash,
    setConsolidateSttInputHash,
    consolidateSttInputIndex,
    setConsolidateSttInputIndex,
    consolidateStateForm,
    setConsolidateStateForm,
    consolidateSttAssets,
    setConsolidateSttAssets,
    consolidateWalletInputs,
    setConsolidateWalletInputs,
    consolidateWalletOutputs,
    setConsolidateWalletOutputs
  };
}
