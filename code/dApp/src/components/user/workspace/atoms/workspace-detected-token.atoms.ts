"use client";

import { atom } from "jotai";
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
import { stateFormFromDatum } from "@/lib/contracts/state-form";
import {
  resolveWalletSpendAddress
} from "@/lib/contracts/blueprint";
import {
  formatDetectedTokenLabel,
  isAsset,
  resolveEffectiveAssetNameHex
} from "@/components/user/workspace/helpers";
import {
  detectedSttTokensAtom,
  lockedContractUtxosAtom,
  lockedContractUtxosLoadingAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import {
  selectedDetectedTokenUnitAtom,
  wizardSelectedActionAtom
} from "@/components/user/workspace/atoms/workspace-selection.atoms";

/**
 * Everything derived from the SELECTED detected STT token: its datum/state-form, capabilities, and
 * the available/advanced wizard actions. Pure derived atoms over the detected-tokens data atom, the
 * config, the locked-utxos, and the wallet/selection atoms — converted from the memo-only
 * `useWorkspaceDetectedTokenDerivations` hook so views and the downstream derivation atoms read
 * them directly instead of through the controller barrel.
 */
export const effectiveWalletAssetNameHexAtom = atom((get) =>
  resolveEffectiveAssetNameHex(get(configAtom))
);

export const selectedDetectedTokenAtom = atom((get) => {
  const unit = get(selectedDetectedTokenUnitAtom);
  return get(detectedSttTokensAtom).find((token) => token.unit === unit) ?? null;
});

export const selectedDetectedTokenAssetsAtom = atom((get) => {
  const token = get(selectedDetectedTokenAtom);
  return token?.utxo.output.amount.filter(isAsset) ?? [];
});

export const selectedDetectedTokenLabelAtom = atom((get) => {
  const token = get(selectedDetectedTokenAtom);
  return token ? formatDetectedTokenLabel(token) : null;
});

export const selectedDetectedTokenStateFormAtom = atom((get) => {
  const token = get(selectedDetectedTokenAtom);
  return token ? stateFormFromDatum(token.datum) : null;
});

// Identity for the client-side orphan / Franken-address discovery: the unit is
// `policyId (28 bytes) + assetNameHex`, and the canonical wallet address is the
// enterprise/base address built from that policy + asset name.
export const orphanDiscoveryPolicyIdAtom = atom((get) =>
  get(selectedDetectedTokenUnitAtom).slice(0, 56)
);
export const orphanDiscoveryAssetNameHexAtom = atom((get) =>
  get(selectedDetectedTokenUnitAtom).slice(56)
);
export const orphanDiscoveryWalletAddressAtom = atom((get) => {
  const sttPolicyId = get(orphanDiscoveryPolicyIdAtom);
  const sttAssetNameHex = get(orphanDiscoveryAssetNameHexAtom);
  return sttPolicyId && sttAssetNameHex
    ? resolveWalletSpendAddress({ sttPolicyId, sttAssetNameHex })
    : "";
});

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
