import { atom } from "jotai";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { mergeDiscoveredWalletUtxos } from "@/lib/discovery/orphan-utxos";
import { lockedContractUtxosAtom } from "../queries/locked-utxos.atoms";
import { selectedOrphanInputsAtom } from "./forms/orphan-inputs.atoms";
import { beneficiaryPreparationActiveAtom } from "./forms/consolidate-form.atoms";
import { consolidateAuthorityPathAtom } from "./forms/stt-spend-form.atoms";
import { selectedActionAtom, selectedDetectedTokenUnitAtom } from "./workspace-selection.atoms";

export const spendableWalletUtxosAtom = atom((get) => {
  const canonical = get(lockedContractUtxosAtom);
  const draft = get(selectedOrphanInputsAtom);
  const action = get(selectedActionAtom);
  const preparingRecovery = action === "consolidate-utxo" &&
    get(beneficiaryPreparationActiveAtom) && get(consolidateAuthorityPathAtom) === "beneficiary";
  if (!draft || (action !== "use-beneficiary" && !preparingRecovery) ||
      draft.walletUnit !== get(selectedDetectedTokenUnitAtom) ||
      draft.signerAddress !== get(activeAddressAtom)) return canonical;
  return mergeDiscoveredWalletUtxos(canonical, draft.outputs);
});
