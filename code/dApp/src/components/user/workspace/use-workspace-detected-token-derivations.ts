"use client";

import { useAtomValue } from "jotai";
import {
  advancedWalletActionsAtom,
  availableWizardActionMapAtom,
  availableWizardActionsAtom,
  effectiveWalletAssetNameHexAtom,
  orphanDiscoveryAssetNameHexAtom,
  orphanDiscoveryPolicyIdAtom,
  orphanDiscoveryWalletAddressAtom,
  selectableWizardActionKindsAtom,
  selectedDetectedTokenAssetsAtom,
  selectedDetectedTokenAtom,
  selectedDetectedTokenLabelAtom,
  selectedDetectedTokenStateFormAtom,
  selectedTokenCapabilityMapAtom,
  selectedWizardActionDescriptorAtom
} from "@/components/user/workspace/atoms/workspace-detected-token.atoms";

/**
 * Thin reader over the detected-token DERIVED ATOMS (workspace-detected-token.atoms.ts). The
 * derivations themselves now live in the atom graph — computed once, read everywhere — so this hook
 * just surfaces them for consumers that still take them via props/ctx. Consumers that read these
 * directly should `useAtomValue` the atoms instead of going through this hook.
 */
export function useWorkspaceDetectedTokenDerivations() {
  return {
    effectiveWalletAssetNameHex: useAtomValue(effectiveWalletAssetNameHexAtom),
    selectedDetectedToken: useAtomValue(selectedDetectedTokenAtom),
    selectedDetectedTokenAssets: useAtomValue(selectedDetectedTokenAssetsAtom),
    selectedDetectedTokenLabel: useAtomValue(selectedDetectedTokenLabelAtom),
    selectedDetectedTokenStateForm: useAtomValue(selectedDetectedTokenStateFormAtom),
    orphanDiscoveryPolicyId: useAtomValue(orphanDiscoveryPolicyIdAtom),
    orphanDiscoveryAssetNameHex: useAtomValue(orphanDiscoveryAssetNameHexAtom),
    orphanDiscoveryWalletAddress: useAtomValue(orphanDiscoveryWalletAddressAtom),
    selectedTokenCapabilityMap: useAtomValue(selectedTokenCapabilityMapAtom),
    availableWizardActions: useAtomValue(availableWizardActionsAtom),
    advancedWalletActions: useAtomValue(advancedWalletActionsAtom),
    selectableWizardActionKinds: useAtomValue(selectableWizardActionKindsAtom),
    availableWizardActionMap: useAtomValue(availableWizardActionMapAtom),
    selectedWizardActionDescriptor: useAtomValue(selectedWizardActionDescriptorAtom)
  };
}
