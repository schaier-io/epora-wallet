import type { RequiredConstrPresetForm, TransferFormState } from "@/components/user/workspace/types";
import { DEFAULT_REQUIRED_CONSTR_PRESET } from "@/components/user/workspace/constants";
import { atom } from "jotai";

export const walletSpendInputHashAtom = atom("");
export const walletSpendInputIndexAtom = atom("");
export const walletSpendRedeemerPresetAtom = atom<RequiredConstrPresetForm>({ ...DEFAULT_REQUIRED_CONSTR_PRESET });
export const walletSpendOutputsAtom = atom<TransferFormState[]>([]);

/** Reset every wallet-spend form field to its default. */
export const resetWalletSpendFormAtom = atom(null, (_get, set) => {
  set(walletSpendInputHashAtom, "");
  set(walletSpendInputIndexAtom, "");
  set(walletSpendRedeemerPresetAtom, { ...DEFAULT_REQUIRED_CONSTR_PRESET });
  set(walletSpendOutputsAtom, []);
});
