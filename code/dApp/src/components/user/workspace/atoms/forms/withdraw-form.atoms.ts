import type { Asset } from "@/lib/types/contracts";
import { createDefaultStateForm, type StateFormState } from "@/lib/contracts/state-form";
import { type StakePool } from "@/components/user/pool-finder";
import { atom } from "jotai";

export const withdrawRewardAddressAtom = atom("");
export const withdrawAmountAtom = atom("1000000");
export const selectedStakePoolAtom = atom<StakePool | null>(null);
export const withdrawSttInputHashAtom = atom("");
export const withdrawSttInputIndexAtom = atom("");
export const withdrawSttStateFormAtom = atom<StateFormState>(createDefaultStateForm());
export const withdrawZeroAdminConfirmedAtom = atom(false);
export const withdrawSttAssetsAtom = atom<Asset[]>([]);

/** Reset every withdraw form field to its default. */
export const resetWithdrawFormAtom = atom(null, (_get, set) => {
  set(withdrawRewardAddressAtom, "");
  set(withdrawAmountAtom, "1000000");
  set(selectedStakePoolAtom, null);
  set(withdrawSttInputHashAtom, "");
  set(withdrawSttInputIndexAtom, "");
  set(withdrawSttStateFormAtom, createDefaultStateForm());
  set(withdrawZeroAdminConfirmedAtom, false);
  set(withdrawSttAssetsAtom, []);
});
