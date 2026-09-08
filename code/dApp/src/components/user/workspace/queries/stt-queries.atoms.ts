import { atom } from "jotai";
import { atomWithQuery, queryClientAtom } from "jotai-tanstack-query";
import { getSttMintPolicyId } from "@/lib/contracts/blueprint";
import { type DetectedSttToken } from "@/lib/mesh/detection";
import { queryPolicy } from "@/lib/query/keys";
import { sttInventoryQueryOptions, sttWalletQueryOptions } from "@/lib/query/stt-inventory";
export { sttInventoryQueryOptions, sttWalletQueryOptions } from "@/lib/query/stt-inventory";
import { chainReadsEnabledAtom } from "@/providers/wallet.atoms";
import { selectedDetectedTokenUnitAtom } from "../atoms/workspace-selection.atoms";
import { pendingWalletStateUpdateAtom } from "../atoms/wallet-state-update.atoms";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceUseDetectedSttTokens.json";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceUseDetectedSttTokens", defaultMessages);
const EMPTY_TOKENS: DetectedSttToken[] = [];

export const sttInventoryQueryAtom = atomWithQuery((get) => ({
  ...sttInventoryQueryOptions(getSttMintPolicyId()),
  enabled: get(chainReadsEnabledAtom) && !get(pendingWalletStateUpdateAtom),
  refetchInterval: get(selectedDetectedTokenUnitAtom) ? false : queryPolicy.activePollMs
}));

export const selectedSttQueryAtom = atomWithQuery((get) => {
  const unit = get(selectedDetectedTokenUnitAtom);
  return {
    ...sttWalletQueryOptions(getSttMintPolicyId(), unit, get(queryClientAtom)),
    enabled: get(chainReadsEnabledAtom) && Boolean(unit) && !get(pendingWalletStateUpdateAtom),
    refetchInterval: queryPolicy.activePollMs
  };
});

export const detectedSttTokensAtom = atom((get) => {
  if (!get(chainReadsEnabledAtom)) return EMPTY_TOKENS;
  const inventory = get(sttInventoryQueryAtom);
  const selected = get(selectedSttQueryAtom);
  const tokens = inventory.data?.tokens ?? EMPTY_TOKENS;
  // A slow policy scan may finish after a newer selected State lookup.
  if (!selected.data) return tokens;
  const units = new Set(tokens.map((token) => token.unit));
  return [...tokens, ...selected.data.tokens.filter((token) => !units.has(token.unit))];
});

export const detectedSttTokensLoadingAtom = atom((get) => {
  if (!get(chainReadsEnabledAtom)) return true;
  const selectedUnit = get(selectedDetectedTokenUnitAtom);
  const inventory = get(sttInventoryQueryAtom);
  return selectedUnit
    ? get(selectedSttQueryAtom).isPending && !inventory.data?.tokens.some((token) => token.unit === selectedUnit)
    : inventory.isPending;
});

export const detectedSttTokensErrorAtom = atom((get) => {
  if (!get(chainReadsEnabledAtom)) return null;
  const error = get(selectedDetectedTokenUnitAtom)
    ? get(selectedSttQueryAtom).error ?? get(sttInventoryQueryAtom).error
    : get(sttInventoryQueryAtom).error;
  return error ? getUserFacingErrorMessage(error, i18n("couldnTCheckTheChainForSmartWallets")) : null;
});
