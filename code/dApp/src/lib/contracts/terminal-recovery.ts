import { readStateSections } from "@/lib/contracts/state-layout";
import type { ConstrData } from "@/lib/types/contracts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsTerminalRecovery.json";

const i18n = createDefaultTranslator("LibContractsTerminalRecovery", defaultMessages);

/** Shown when the final beneficiary remains available after a withdrawal. */
export const REPEATABLE_RECOVERY_NOTICE =
  i18n("thisIsPermanentAfterYouSign");

export function isRepeatableBeneficiaryRecovery(stateDatum: ConstrData) {
  const sections = readStateSections(stateDatum, "Beneficiary recovery state");
  return sections.beneficiaries.length === 1;
}
