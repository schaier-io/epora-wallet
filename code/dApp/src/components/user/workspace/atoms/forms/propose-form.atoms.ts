import type { Asset } from "@/lib/types/contracts";
import { createDefaultStateForm, type StateFormState } from "@/lib/contracts/state-form";
import { atom } from "jotai";

export const proposalJsonAtom = atom("{}");
export const proposalSttInputHashAtom = atom("");
export const proposalSttInputIndexAtom = atom("");
export const proposalSttStateFormAtom = atom<StateFormState>(createDefaultStateForm());
export const proposalZeroAdminConfirmedAtom = atom(false);
export const proposalSttAssetsAtom = atom<Asset[]>([]);

/** Reset every propose form field to its default. */
export const resetProposeFormAtom = atom(null, (_get, set) => {
  set(proposalJsonAtom, "{}");
  set(proposalSttInputHashAtom, "");
  set(proposalSttInputIndexAtom, "");
  set(proposalSttStateFormAtom, createDefaultStateForm());
  set(proposalZeroAdminConfirmedAtom, false);
  set(proposalSttAssetsAtom, []);
});
