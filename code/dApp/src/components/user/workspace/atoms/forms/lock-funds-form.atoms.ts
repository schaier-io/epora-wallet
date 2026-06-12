import type { Asset } from "@/lib/types/contracts";
import { cloneAssets } from "@/components/user/workspace/helpers";
import { DEFAULT_LOCK_ASSETS } from "@/components/user/workspace/constants";
import { atom } from "jotai";

export const lockFundsAssetsAtom = atom<Asset[]>(cloneAssets(DEFAULT_LOCK_ASSETS));

/** Reset every lock-funds form field to its default. */
export const resetLockFundsFormAtom = atom(null, (_get, set) => {
  set(lockFundsAssetsAtom, cloneAssets(DEFAULT_LOCK_ASSETS));
});
