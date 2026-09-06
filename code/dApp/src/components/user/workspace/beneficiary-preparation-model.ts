import type { Protocol } from "@meshsdk/common";
import type { UTxO } from "@meshsdk/core";
import type { Asset, WalletInputRef } from "@/lib/types/contracts";
import { assertBeneficiaryPreparationAuthority, planBeneficiaryRecoveryPreparation } from "@/lib/contracts/beneficiary-recovery-preparation";
import { stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
import { getValidityWindow } from "@/lib/mesh/transactions";
import { extractErrorMessage } from "@/lib/utils/errors";
import { mergeAmountLists } from "./helpers/asset-amounts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceBeneficiaryPreparationModel.json";
const i18n = createDefaultTranslator("ComponentsUserWorkspaceBeneficiaryPreparationModel", defaultMessages);

export function deriveBeneficiaryPreparationPreview(input: {
  form: StateFormState; signer: string | null; selectedRefs: WalletInputRef[]; utxos: UTxO[];
  poolAssets: Asset[]; walletAddress: string; nowMs: number; protocolParams: Protocol | null;
  loading: boolean; discoveryError: string | null; protocolError: boolean;
}) {
  let selectedAmount: Asset[] = [];
  try {
    if (input.loading) throw new Error(i18n("loading"));
    if (input.discoveryError) throw new Error(input.discoveryError);
    if (input.protocolError) throw new Error(i18n("protocolError"));
    if (!input.protocolParams) throw new Error(i18n("loading"));
    if (!input.signer) throw new Error(i18n("connect"));
    if (!input.selectedRefs.length) throw new Error(i18n("select"));
    const keys = input.selectedRefs.map(ref => `${ref.txHash}#${ref.outputIndex}`);
    if (new Set(keys).size !== keys.length) throw new Error(i18n("missing"));
    const selected = input.selectedRefs.map(ref => {
      const matches = input.utxos.filter(utxo => utxo.input.txHash === ref.txHash && utxo.input.outputIndex === ref.outputIndex);
      if (matches.length !== 1) throw new Error(i18n("missing"));
      return matches[0]!;
    });
    if (input.nowMs <= 0) throw new Error(i18n("clock"));
    const stateDatum = stateFormToDatum(input.form);
    assertBeneficiaryPreparationAuthority(stateDatum, input.signer, getValidityWindow(input.nowMs).earliestTimeMs);
    selectedAmount = mergeAmountLists(selected.map(utxo => utxo.output.amount));
    const plan = planBeneficiaryRecoveryPreparation({ stateDatum, selectedAmount, poolAssets: input.poolAssets, walletAddress: input.walletAddress, protocolParams: input.protocolParams });
    return { plan, selectedAmount, error: null };
  } catch (error) {
    return { plan: null, selectedAmount, error: extractErrorMessage(error, i18n("unavailable")) };
  }
}
