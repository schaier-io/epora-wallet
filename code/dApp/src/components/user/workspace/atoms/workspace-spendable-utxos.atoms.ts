import { atom } from "jotai";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { mergeDiscoveredWalletUtxos } from "@/lib/discovery/orphan-utxos";
import { lockedContractUtxosAtom } from "../queries/locked-utxos.atoms";
import { selectedOrphanInputsAtom } from "./forms/orphan-inputs.atoms";
import { selectedActionAtom, selectedDetectedTokenUnitAtom } from "./workspace-selection.atoms";

export const spendableWalletUtxosAtom = atom((get) => {
  const canonical = get(lockedContractUtxosAtom);
  const draft = get(selectedOrphanInputsAtom);
  if (!draft || get(selectedActionAtom) !== "use-beneficiary" ||
      draft.walletUnit !== get(selectedDetectedTokenUnitAtom) ||
      draft.signerAddress !== get(activeAddressAtom)) return canonical;
  return mergeDiscoveredWalletUtxos(canonical, draft.outputs);
});
