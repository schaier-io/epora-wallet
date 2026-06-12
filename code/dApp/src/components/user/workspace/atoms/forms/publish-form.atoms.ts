import type { Asset } from "@/lib/types/contracts";
import { createDefaultStateForm, type StateFormState } from "@/lib/contracts/state-form";
import { atom } from "jotai";

export const publishCertificateJsonAtom = atom("{}");
export const publishSttInputHashAtom = atom("");
export const publishSttInputIndexAtom = atom("");
export const publishSttStateFormAtom = atom<StateFormState>(createDefaultStateForm());
export const publishZeroAdminConfirmedAtom = atom(false);
export const publishSttAssetsAtom = atom<Asset[]>([]);

/** Reset every publish form field to its default. */
export const resetPublishFormAtom = atom(null, (_get, set) => {
  set(publishCertificateJsonAtom, "{}");
  set(publishSttInputHashAtom, "");
  set(publishSttInputIndexAtom, "");
  set(publishSttStateFormAtom, createDefaultStateForm());
  set(publishZeroAdminConfirmedAtom, false);
  set(publishSttAssetsAtom, []);
});
