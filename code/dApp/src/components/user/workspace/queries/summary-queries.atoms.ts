import { atom } from "jotai";
import { selectAtom } from "jotai/utils";
import { atomWithQueries } from "jotai-tanstack-query";
import type { UTxO } from "@meshsdk/common";
import { resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { queryKeys, queryPolicy } from "@/lib/query/keys";
import { activePaymentKeyHashAtom, chainReadsEnabledAtom } from "@/providers/wallet.atoms";
import { isAsset } from "../helpers/guards";
import { mergeAmountLists } from "../helpers/asset-amounts";
import type { PermissionWalletLockedSummary } from "../types";
import { detectedSttTokensAtom } from "./stt-queries.atoms";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceUseDetectedSttTokens.json";

import { selectedDetectedTokenUnitAtom } from "../atoms/workspace-selection.atoms";
import { walletConnectionDialogOpenAtom } from "../atoms/workspace-ui.atoms";
import { holdsAnyRole, resolveTokenCapabilityMap } from "@/components/user/wizard-capabilities";
import { stateFormFromDatum } from "@/lib/contracts/state-form";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceUseDetectedSttTokens", defaultMessages);
const summaryTokensAtom = atom((get) => {
  const signer = get(activePaymentKeyHashAtom);
  const selectedUnit = get(selectedDetectedTokenUnitAtom);
  return get(detectedSttTokensAtom).filter((token) => !signer || token.unit === selectedUnit ||
    holdsAnyRole(resolveTokenCapabilityMap({
      state: stateFormFromDatum(token.datum), paymentKeyHash: signer,
      lockedUtxoCount: 0, lockedUtxosLoading: false
    })));
});
const summaryReadsEnabledAtom = atom((get) => get(chainReadsEnabledAtom) &&
  (!get(selectedDetectedTokenUnitAtom) || get(walletConnectionDialogOpenAtom)));
export const walletSummaryTargetsAtom = selectAtom(summaryTokensAtom, (tokens) => tokens.map((token) => {
  try {
    return { unit: token.unit, address: resolveWalletContinuingOutputAddressFromState({
      sttPolicyId: token.policyId, sttAssetNameHex: token.assetNameHex, stateDatum: token.datum
    }), error: null };
  } catch {
    return { unit: token.unit, address: "", error: i18n("couldnTLoadThisSmartWalletSBalance") };
  }
}), (previous, next) => previous.length === next.length && previous.every((target, index) =>
  target.unit === next[index].unit && target.address === next[index].address && target.error === next[index].error
));

// The list owns observers only. Each response stays in the shared address query cache.
const summaryObserversAtom = atom((get) => {
  const targets = get(walletSummaryTargetsAtom);
  return atomWithQueries({
    queries: targets.map((target) => (read) => ({
      queryKey: queryKeys.addressUtxos(target.address),
      queryFn: ({ signal }) => new ServerFetcher({ signal }).fetchAddressUTxOs(target.address),
      staleTime: queryPolicy.chainStaleMs,
      gcTime: queryPolicy.chainGcMs,
      enabled: read(summaryReadsEnabledAtom) && Boolean(target.address),
      refetchInterval: queryPolicy.activePollMs
    })),
    combine: (results) => ({
      summaries: Object.fromEntries(targets.map((target, index) => {
        const result = results[index];
        const utxos = (result.data ?? []) as UTxO[];
        return [target.unit, {
          address: target.address,
          lockedAssets: mergeAmountLists(utxos.map((utxo) => utxo.output.amount.filter(isAsset))),
          lockedUtxoCount: utxos.length,
          error: target.error ?? (result.error ? i18n("couldnTLoadThisSmartWalletSBalance") : null)
        } satisfies PermissionWalletLockedSummary];
      })),
      loading: results.some((result, index) => Boolean(targets[index].address) && result.isPending)
    })
  });
});

export const permissionWalletSummariesAtom = atom((get) => get(get(summaryObserversAtom)).summaries);
export const permissionWalletSummariesLoadingAtom = atom((get) => get(summaryReadsEnabledAtom) && get(get(summaryObserversAtom)).loading);
