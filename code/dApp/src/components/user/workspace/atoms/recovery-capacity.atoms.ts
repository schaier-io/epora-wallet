import { atom } from "jotai";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { configAtom } from "./workspace-config.atoms";
import { selectedActionAtom, selectedDetectedTokenUnitAtom } from "./workspace-selection.atoms";
import { selectedDetectedTokenStateFormAtom } from "./workspace-detected-token.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "./workspace-data.atoms";
import { sttStateFormAtom, sttInputTxHashAtom, sttInputOutputIndexAtom, sttWalletInputsAtom, sttExtraTransfersAtom, sttAuthorityPathAtom } from "./forms/stt-spend-form.atoms";
import { safeStringify } from "../helpers/guards";

export const recoveryCapacityFailureAtom = atom<{ kind: "bytes" | "execution"; signature: string } | null>(null);

/** Read from the live store before and after a failed attempt, not a render closure. */
export const recoveryCapacitySignatureAtom = atom((get) => {
  const refs = get(sttWalletInputsAtom);
  return safeStringify({
    action: get(selectedActionAtom), walletUnit: get(selectedDetectedTokenUnitAtom),
    config: get(configAtom), actor: get(activePaymentKeyHashAtom),
    state: get(selectedDetectedTokenStateFormAtom) ?? get(sttStateFormAtom),
    sttInput: { txHash: get(sttInputTxHashAtom), outputIndex: get(sttInputOutputIndexAtom) },
    refs, amounts: get(lockedContractUtxosAtom).filter(utxo => refs.some(ref => ref.txHash === utxo.input.txHash && ref.outputIndex === utxo.input.outputIndex)),
    loading: get(lockedContractUtxosLoadingAtom), discoveryError: get(lockedContractUtxosErrorAtom),
    transfers: get(sttExtraTransfersAtom), authority: get(sttAuthorityPathAtom)
  });
});

export const currentRecoveryCapacityFailureAtom = atom((get) => {
  const failure = get(recoveryCapacityFailureAtom);
  return get(selectedActionAtom) === "use-beneficiary" && failure?.signature === get(recoveryCapacitySignatureAtom) ? failure : null;
});
