import type { Asset, WalletInputRef } from "@/lib/types/contracts";
import { createDefaultStateForm, type StateFormState } from "@/lib/contracts/state-form";
import type { WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { atom } from "jotai";

export const consolidateSttInputHashAtom = atom("");
export const consolidateSttInputIndexAtom = atom("");
export const consolidateStateFormAtom = atom<StateFormState>(createDefaultStateForm());
export const consolidateSttAssetsAtom = atom<Asset[]>([]);
export const consolidateWalletInputsAtom = atom<WalletInputRef[]>([]);
export const consolidateWalletOutputsAtom = atom<
    WalletScriptOutputFormState[]
  >([]);

/** Reset every consolidate form field to its default. */
export const resetConsolidateFormAtom = atom(null, (_get, set) => {
  set(consolidateSttInputHashAtom, "");
  set(consolidateSttInputIndexAtom, "");
  set(consolidateStateFormAtom, createDefaultStateForm());
  set(consolidateSttAssetsAtom, []);
  set(consolidateWalletInputsAtom, []);
  set(consolidateWalletOutputsAtom, []);
});
