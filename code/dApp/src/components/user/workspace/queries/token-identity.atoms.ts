import { atom } from "jotai";
import { stateFormFromDatum } from "@/lib/contracts/state-form";
import { resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { formatDetectedTokenLabel } from "../helpers/formatters";
import { isAsset } from "../helpers/guards";
import { resolveEffectiveAssetNameHex } from "../helpers/misc";
import { configAtom } from "../atoms/workspace-config.atoms";
import { selectedDetectedTokenUnitAtom } from "../atoms/workspace-selection.atoms";
import { detectedSttTokensAtom } from "./stt-queries.atoms";

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
  const token = get(selectedDetectedTokenAtom);
  if (!token) return "";
  const sttPolicyId = get(orphanDiscoveryPolicyIdAtom);
  const sttAssetNameHex = get(orphanDiscoveryAssetNameHexAtom);
  return sttPolicyId && sttAssetNameHex
    ? resolveWalletContinuingOutputAddressFromState({ sttPolicyId, sttAssetNameHex, stateDatum: token.datum })
    : "";
});
