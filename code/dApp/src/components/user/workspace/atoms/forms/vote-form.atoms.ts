import type { Asset } from "@/lib/types/contracts";
import { createDefaultStateForm, type StateFormState } from "@/lib/contracts/state-form";
import { atom } from "jotai";

export const voteJsonAtom = atom("{}");
export const voteSttInputHashAtom = atom("");
export const voteSttInputIndexAtom = atom("");
export const voteSttStateFormAtom = atom<StateFormState>(createDefaultStateForm());
export const voteZeroAdminConfirmedAtom = atom(false);
export const voteSttAssetsAtom = atom<Asset[]>([]);

/** Reset every vote form field to its default. */
export const resetVoteFormAtom = atom(null, (_get, set) => {
  set(voteJsonAtom, "{}");
  set(voteSttInputHashAtom, "");
  set(voteSttInputIndexAtom, "");
  set(voteSttStateFormAtom, createDefaultStateForm());
  set(voteZeroAdminConfirmedAtom, false);
  set(voteSttAssetsAtom, []);
});
