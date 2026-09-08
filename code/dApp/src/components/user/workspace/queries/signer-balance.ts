import { atom } from "jotai";
import { atomWithQuery } from "jotai-tanstack-query";
import { activeAddressAtom, activeWalletAtom, activeWalletNameAtom, networkIdAtom, walletReadyAtom } from "@/providers/wallet.atoms";
import { queryKeys, queryPolicy } from "@/lib/query/keys";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceUseWalletBalance.json";
import { isAsset } from "../helpers/guards";
import { mergeAmountLists } from "../helpers/asset-amounts";
import type { WalletBalanceSummary } from "../types";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceUseWalletBalance", defaultMessages);
export const signerUtxosKeyAtom = atom(get => queryKeys.signerUtxos(
  get(networkIdAtom), get(activeWalletNameAtom), get(activeAddressAtom)
));
export const signerUtxosQueryAtom = atomWithQuery(get => {
  const wallet = get(activeWalletAtom);
  return {
    queryKey: get(signerUtxosKeyAtom),
    enabled: Boolean(wallet && get(walletReadyAtom) && get(activeAddressAtom)),
    refetchInterval: queryPolicy.activePollMs,
    queryFn: async ({ signal }) => {
      if (!wallet) throw new Error("Wallet is not connected");
      const utxos = await wallet.getUtxos();
      // CIP-30 has no AbortSignal. Retire the result after an identity change.
      signal.throwIfAborted();
      return utxos;
    }
  };
});

/** Read-only view of the shared query. Jotai never owns a second remote snapshot. */
export const walletBalanceSummaryAtom = atom<WalletBalanceSummary>(get => {
  if (!get(walletReadyAtom) || !get(activeAddressAtom)) return { assets: [], loading: false, error: null };
  const result = get(signerUtxosQueryAtom);
  return {
    assets: mergeAmountLists((result.data ?? []).map(utxo => utxo.output.amount.filter(isAsset))),
    loading: result.isPending || result.isFetching,
    error: result.error ? getUserFacingErrorMessage(result.error, i18n("couldnTRefreshTheConnectedWalletBalanceCheck")) : null
  };
});
