import type { Asset } from "@/lib/types/contracts";
import { createDefaultStateForm, type StateFormState } from "@/lib/contracts/state-form";
import { cloneAssets } from "@/components/user/workspace/helpers";
import { DEFAULT_MINT_STARTER_ASSETS } from "@/components/user/workspace/constants";
import { atom } from "jotai";

export const mintReferenceAtom = atom("");
export const mintStateFormAtom = atom<StateFormState>(createDefaultStateForm());
export const mintStarterAssetsAtom = atom<Asset[]>(cloneAssets(DEFAULT_MINT_STARTER_ASSETS));
export const mintZeroAdminConfirmedAtom = atom(false);

/** Reset every mint form field to its default. */
export const resetMintFormAtom = atom(null, (_get, set) => {
  set(mintReferenceAtom, "");
  set(mintStateFormAtom, createDefaultStateForm());
  set(mintStarterAssetsAtom, cloneAssets(DEFAULT_MINT_STARTER_ASSETS));
  set(mintZeroAdminConfirmedAtom, false);
});
