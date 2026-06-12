"use client";

import { useAtom } from "jotai";
import { consolidateSttInputHashAtom, consolidateSttInputIndexAtom, consolidateStateFormAtom, consolidateSttAssetsAtom, consolidateWalletInputsAtom, consolidateWalletOutputsAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";

/**
 * Form state for the consolidate-orphans action and the STT context it spends.
 */
export function useConsolidateForm() {
  const [consolidateSttInputHash, setConsolidateSttInputHash] = useAtom(consolidateSttInputHashAtom);
  const [consolidateSttInputIndex, setConsolidateSttInputIndex] = useAtom(consolidateSttInputIndexAtom);
  const [consolidateStateForm, setConsolidateStateForm] = useAtom(consolidateStateFormAtom);
  const [consolidateSttAssets, setConsolidateSttAssets] = useAtom(consolidateSttAssetsAtom);
  const [consolidateWalletInputs, setConsolidateWalletInputs] = useAtom(consolidateWalletInputsAtom);
  const [consolidateWalletOutputs, setConsolidateWalletOutputs] = useAtom(consolidateWalletOutputsAtom);

  return {
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
