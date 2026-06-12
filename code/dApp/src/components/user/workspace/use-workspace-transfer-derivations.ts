"use client";

import { useAtomValue } from "jotai";
import {
  allocatedLockedContractAssetsAtom,
  availableLockedTransferAssetOptionsAtom,
  availableLockedTransferAssetsAtom,
  requestedLockedAssetTotalsAtom,
  selectedLockedContractAssetsAtom,
  selectedTransferAssetAtom,
  streamingPaymentPayoutRowsAtom,
  streamingPaymentPayoutTransfersAtom,
  suggestedLockedInputsAtom,
  transferSourceAssetsAtom,
  wealthSeriesAtom,
  wealthSeriesForAssetAtom
} from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";

/**
 * Thin reader over the transfer/locked-asset DERIVED ATOMS (workspace-transfer-derivations.atoms.ts).
 * The derivations live in the atom graph (computed once); this hook surfaces them for the builder /
 * effect / validation ctx that still take them by prop. Views read the atoms directly.
 */
export function useWorkspaceTransferDerivations() {
  return {
    wealthSeries: useAtomValue(wealthSeriesAtom),
    wealthSeriesForAsset: useAtomValue(wealthSeriesForAssetAtom),
    selectedLockedContractAssets: useAtomValue(selectedLockedContractAssetsAtom),
    allocatedLockedContractAssets: useAtomValue(allocatedLockedContractAssetsAtom),
    transferSourceAssets: useAtomValue(transferSourceAssetsAtom),
    availableLockedTransferAssets: useAtomValue(availableLockedTransferAssetsAtom),
    availableLockedTransferAssetOptions: useAtomValue(availableLockedTransferAssetOptionsAtom),
    selectedTransferAsset: useAtomValue(selectedTransferAssetAtom),
    streamingPaymentPayoutRows: useAtomValue(streamingPaymentPayoutRowsAtom),
    streamingPaymentPayoutTransfers: useAtomValue(streamingPaymentPayoutTransfersAtom),
    requestedLockedAssetTotals: useAtomValue(requestedLockedAssetTotalsAtom),
    suggestedLockedInputs: useAtomValue(suggestedLockedInputsAtom)
  };
}
