import type { UTxO } from "@meshsdk/core";
import type { WalletInputRef } from "@/lib/types/contracts";
import { deriveBeneficiaryDistributionStateDatum } from "@/lib/contracts/beneficiary-distribution";
import { stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
import { getValidityWindow } from "@/lib/mesh/transactions";
import { extractErrorMessage } from "@/lib/utils/errors";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceBeneficiaryDistributionModel.json";
const i18n = createDefaultTranslator("ComponentsUserWorkspaceBeneficiaryDistributionModel", defaultMessages);

/** Advisory distribution. The builder re-fetches the input and State before signing. */
export function deriveBeneficiaryDistributionPreview(input: {
  form: StateFormState;
  signer: string | null;
  selectedRefs: WalletInputRef[];
  utxos: UTxO[];
  nowMs: number;
  sttInput: WalletInputRef;
  loading?: boolean;
  discoveryError?: string | null;
}) {
  try {
    if (input.loading) throw new Error(i18n("loading"));
    if (input.discoveryError) throw new Error(input.discoveryError);
    if (!input.signer) throw new Error(i18n("connect"));
    if (input.selectedRefs.length !== 1) throw new Error(i18n("select"));
    const selectedRef = input.selectedRefs[0]!;
    const selected = input.utxos.filter((utxo) => utxo.input.txHash === selectedRef.txHash && utxo.input.outputIndex === selectedRef.outputIndex);
    if (selected.length !== 1) throw new Error(i18n("missing"));
    if (input.nowMs <= 0) throw new Error(i18n("clock"));
    const window = getValidityWindow(input.nowMs);
    const details = deriveBeneficiaryDistributionStateDatum({
      stateDatum: stateFormToDatum(input.form),
      beneficiarySignerKeyHash: input.signer,
      walletInputAmount: selected[0]!.output.amount,
      sttInput: input.sttInput,
      txEarliestTimeMs: window.earliestTimeMs,
      txLatestTimeMs: window.latestTimeMs
    });
    return { details, error: null };
  } catch (error) {
    return { details: null, error: extractErrorMessage(error, i18n("unavailable")) };
  }
}
