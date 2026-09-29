import { atom } from "jotai";
import { atomWithQuery } from "jotai-tanstack-query";
import { sharedReferenceQueryOptions } from "@/lib/query/shared-reference";
import { chainReadsEnabledAtom } from "@/providers/wallet.atoms";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceUseSharedSttReference.json";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceUseSharedSttReference", defaultMessages);
export const sharedReferenceQueryAtom = atomWithQuery((get) => ({
  ...sharedReferenceQueryOptions(), enabled: get(chainReadsEnabledAtom)
}));
export const sharedSttReferenceStoreAtom = atom((get) => get(chainReadsEnabledAtom) ? get(sharedReferenceQueryAtom).data ?? null : null);
export const sharedSttReferenceStoreLoadingAtom = atom((get) => !get(chainReadsEnabledAtom) || get(sharedReferenceQueryAtom).isPending);
export const sharedSttReferenceStoreErrorAtom = atom((get) => {
  const error = get(chainReadsEnabledAtom) ? get(sharedReferenceQueryAtom).error : null;
  return error ? getUserFacingErrorMessage(error, i18n("couldNotCheckTheOneTimeSetup")) : null;
});
