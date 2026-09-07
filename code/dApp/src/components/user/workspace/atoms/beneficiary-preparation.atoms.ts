import { atom } from "jotai";
import type { Protocol } from "@meshsdk/common";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { activeInferredSttStateFormAtom, lockingContractAtom } from "./workspace-wallet-derivations.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "./workspace-data.atoms";
import { renderNowMsAtom } from "./workspace-ui.atoms";
import { beneficiaryPreparationActiveAtom, beneficiaryPreparationPoolAssetsAtom, consolidateWalletInputsAtom } from "./forms/consolidate-form.atoms";
import { deriveBeneficiaryPreparationPreview } from "../beneficiary-preparation-model";

export const beneficiaryPreparationProtocolAtom = atom<{ address: string; params: Protocol | null; error: boolean } | null>(null);
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
