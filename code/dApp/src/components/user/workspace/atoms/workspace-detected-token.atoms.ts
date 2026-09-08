"use client";

import { atom } from "jotai";
import { selectedDetectedTokenStateFormAtom } from "../queries/token-identity.atoms";
export { effectiveWalletAssetNameHexAtom, selectedDetectedTokenAtom, selectedDetectedTokenAssetsAtom,
  selectedDetectedTokenLabelAtom, selectedDetectedTokenStateFormAtom, orphanDiscoveryPolicyIdAtom,
  orphanDiscoveryAssetNameHexAtom, orphanDiscoveryWalletAddressAtom } from "../queries/token-identity.atoms";
import type {
  AvailableActionDescriptor,
  TokenCapabilityMap,
  UserActionKind
} from "@/components/user/flow-types";
import {
  buildAdvancedWizardActions,
  buildAvailableWizardActions,
  resolveTokenCapabilityMap
} from "@/components/user/wizard-capabilities";
import {
  lockedContractUtxosAtom,
  lockedContractUtxosLoadingAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import {
  wizardSelectedActionAtom
} from "@/components/user/workspace/atoms/workspace-selection.atoms";

/**
 * Everything derived from the SELECTED detected STT token: its datum/state-form, capabilities, and
 * the available/advanced wizard actions. Pure derived atoms over the detected-tokens data atom, the
 * config, the locked-utxos, and the wallet/selection atoms, converted from the memo-only
 * `useWorkspaceDetectedTokenDerivations` hook so views and the downstream derivation atoms read
 * them directly instead of through the controller barrel.
 */
export const selectedTokenCapabilityMapAtom = atom<TokenCapabilityMap | null>((get) => {
  const state = get(selectedDetectedTokenStateFormAtom);
  if (!state) return null;
  return resolveTokenCapabilityMap({
    state,
    paymentKeyHash: get(activePaymentKeyHashAtom),
    lockedUtxoCount: get(lockedContractUtxosAtom).length,
    lockedUtxosLoading: get(lockedContractUtxosLoadingAtom)
  });
});

export const availableWizardActionsAtom = atom<AvailableActionDescriptor[]>((get) => {
  const map = get(selectedTokenCapabilityMapAtom);
  return map ? buildAvailableWizardActions(map) : [];
});

export const advancedWalletActionsAtom = atom<UserActionKind[]>((get) => {
  const map = get(selectedTokenCapabilityMapAtom);
  return map ? buildAdvancedWizardActions(map) : [];
});

export const selectableWizardActionKindsAtom = atom(
  (get) =>
    new Set<UserActionKind>([
      ...get(availableWizardActionsAtom).map((descriptor) => descriptor.kind),
      ...get(advancedWalletActionsAtom)
    ])
);

export const availableWizardActionMapAtom = atom(
  (get) =>
    Object.fromEntries(
      get(availableWizardActionsAtom).map((descriptor) => [descriptor.kind, descriptor])
    ) as Partial<Record<UserActionKind, AvailableActionDescriptor>>
);

export const selectedWizardActionDescriptorAtom = atom((get) => {
  const selected = get(wizardSelectedActionAtom);
  const map = get(availableWizardActionMapAtom);
  return selected && map[selected] ? map[selected] : null;
});
