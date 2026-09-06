"use client";
import { useStore } from "jotai";
import { useWorkspaceActions } from "./workspace-actions-context";
import { beneficiaryPreparationActiveAtom, beneficiaryPreparationPoolAssetsAtom, consolidateWalletInputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { consolidateAuthorityPathAtom, sttWalletInputsAtom } from "./atoms/forms/stt-spend-form.atoms";

export function useBeneficiaryPreparationNavigation() {
  const store = useStore();
  const { openWorkspaceIntent } = useWorkspaceActions();
  return () => {
    const refs = store.get(sttWalletInputsAtom).map(ref => ({ ...ref }));
    openWorkspaceIntent("consolidate", "consolidate-utxo");
    // Navigation resets drafts and picks the normal operator path first.
    store.set(beneficiaryPreparationActiveAtom, true);
    store.set(beneficiaryPreparationPoolAssetsAtom, []);
    store.set(consolidateWalletInputsAtom, refs);
    store.set(consolidateAuthorityPathAtom, "beneficiary");
  };
}
