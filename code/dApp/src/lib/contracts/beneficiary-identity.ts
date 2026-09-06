import type { ConstrData } from "@/lib/types/contracts";
import { isConstrData, readStateSections } from "./state-layout";
import { unwrapStateDatum } from "./stt-datum";
import { readInteger } from "./plutus-primitives";

export function deriveBeneficiaryWithdrawalId(stateDatum: ConstrData, signerKeyHash: string) {
  const unwrappedStateDatum = unwrapStateDatum(stateDatum, "Beneficiary Withdrawal state datum");
  const { beneficiaries } = readStateSections(
    unwrappedStateDatum,
    "Beneficiary Withdrawal state datum"
  );

  const matches = beneficiaries.flatMap((beneficiary, index) => {
    if (!isConstrData(beneficiary) || beneficiary.alternative !== 0 || beneficiary.fields.length !== 5) {
      throw new Error(
        `Beneficiary Withdrawal beneficiaries[${index}] must be a Beneficiary constructor.`
      );
    }

    const beneficiaryId = readInteger(
      beneficiary.fields[0],
      `Beneficiary Withdrawal beneficiaries[${index}].id`
    );
    const beneficiaryWallets = beneficiary.fields[1];
    if (!Array.isArray(beneficiaryWallets)) {
      throw new Error(
        `Beneficiary Withdrawal beneficiaries[${index}].beneficiary_wallets must be a list.`
      );
    }

    return beneficiaryWallets.includes(signerKeyHash) ? [beneficiaryId] : [];
  });

  if (matches.length !== 1) {
    throw new Error(
      "Beneficiary Withdrawal requires exactly one beneficiary matching the connected payment key hash."
    );
  }

  return matches[0]!;
}
