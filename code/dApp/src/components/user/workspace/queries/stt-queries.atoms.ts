import { atom } from "jotai";
import { atomWithQuery, queryClientAtom } from "jotai-tanstack-query";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getSttMintPolicyId } from "@/lib/contracts/blueprint";
import { detectSttInfo, type DetectedSttInfo, type DetectedSttToken } from "@/lib/mesh/detection";
import { queryKeys, queryPolicy } from "@/lib/query/keys";
import { chainReadsEnabledAtom } from "@/providers/wallet.atoms";
import { selectedDetectedTokenUnitAtom } from "../atoms/workspace-selection.atoms";
import { pendingWalletStateUpdateAtom } from "../atoms/wallet-state-update.atoms";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceUseDetectedSttTokens.json";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceUseDetectedSttTokens", defaultMessages);
const EMPTY_TOKENS: DetectedSttToken[] = [];

export function sttInventoryQueryOptions(policyId: string) {
  return queryOptions({
    queryKey: queryKeys.sttInventory(policyId),
    queryFn: ({ signal }) => detectSttInfo(undefined, signal),
    staleTime: queryPolicy.chainStaleMs,
    gcTime: queryPolicy.chainGcMs
  });
}

export function sttWalletQueryOptions(policyId: string, unit: string, client: QueryClient) {
  return queryOptions({
    queryKey: queryKeys.sttWallet(policyId, unit),
    queryFn: async ({ signal }) => {
      const previous = client.getQueryData<DetectedSttInfo>(queryKeys.sttWallet(policyId, unit));
      const next = await detectSttInfo(unit, signal);
      // A spent State may disappear briefly before its successor reaches the indexer.
      if (previous?.tokens.length && !next.tokens.length) throw new Error("State token not indexed yet");
      return next;
    },
    staleTime: queryPolicy.chainStaleMs,
    gcTime: queryPolicy.chainGcMs
  });
}

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
  const units = new Set(selected.data.tokens.map((token) => token.unit));
  return [...tokens.filter((token) => !units.has(token.unit)), ...selected.data.tokens];
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
