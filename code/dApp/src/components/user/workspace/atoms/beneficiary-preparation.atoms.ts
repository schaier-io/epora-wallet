import { atom } from "jotai";
import { atomWithQuery } from "jotai-tanstack-query";
import { protocolParametersQueryOptions } from "@/lib/query/chain";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { activeInferredSttStateFormAtom, lockingContractAtom } from "./workspace-wallet-derivations.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "./workspace-data.atoms";
import { renderNowMsAtom } from "./workspace-ui.atoms";
import { beneficiaryPreparationActiveAtom, beneficiaryPreparationPoolAssetsAtom, consolidateWalletInputsAtom } from "./forms/consolidate-form.atoms";
import { deriveBeneficiaryPreparationPreview } from "../beneficiary-preparation-model";

const preparationProtocolQueryAtom = atomWithQuery(get => ({
  ...protocolParametersQueryOptions(),
  enabled: get(beneficiaryPreparationActiveAtom)
}));
export const beneficiaryPreparationProtocolAtom = atom(get => {
  if (!get(beneficiaryPreparationActiveAtom)) return null;
  const address = get(lockingContractAtom).address ?? "";
  if (!address) return null;
  const query = get(preparationProtocolQueryAtom);
  return { address, params: query.data ?? null, error: query.isError, loading: query.isPending || query.isFetching };
});
export const beneficiaryPreparationPreviewAtom = atom((get) => {
  if (!get(beneficiaryPreparationActiveAtom)) return { plan: null, selectedAmount: [], error: null };
  const address = get(lockingContractAtom).address ?? "";
  const protocol = get(beneficiaryPreparationProtocolAtom);
  const current = protocol?.address === address ? protocol : null;
  return deriveBeneficiaryPreparationPreview({
    form: get(activeInferredSttStateFormAtom), signer: get(activePaymentKeyHashAtom),
    selectedRefs: get(consolidateWalletInputsAtom), utxos: get(lockedContractUtxosAtom),
    poolAssets: get(beneficiaryPreparationPoolAssetsAtom), walletAddress: address,
    nowMs: get(renderNowMsAtom), protocolParams: current?.params ?? null,
    loading: get(lockedContractUtxosLoadingAtom), discoveryError: get(lockedContractUtxosErrorAtom),
    protocolError: current?.error ?? false
  });
});
