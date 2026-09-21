import type { Asset, AuthorityPath, ConsolidateAuthorityPath, OperatorAuthorityPath, WalletInputRef } from "@/lib/types/contracts";
import { createDefaultStateForm, type ProofOfLifeOverrideMode, type StateFormState } from "@/lib/contracts/state-form";
import type { SttSpendActionMode, TransferFormState, WalletScriptOutputFormState } from "@/components/user/workspace/types";
import { atom } from "jotai";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { parseAdaToLovelace } from "@/lib/units/lovelace";
import { DEFAULT_OPTIONAL_CONSTR_PRESET } from "@/components/user/workspace/constants";
import { transferCustomAddressAtom, transferDisplayAmountAtom, transferRecipientModeAtom, transferSelectedUnitAtom } from "./transfer-form.atoms";
import { withBeneficiarySigningAddressesDerived } from "@/components/user/workspace/helpers/form-state";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";

export const sttInputTxHashAtom = atom("");
export const sttInputOutputIndexAtom = atom("");
export const sttStateFormAtom = atom<StateFormState>(createDefaultStateForm());
export const updateStateFormAtom = atom<StateFormState | null>(null);
export const sttZeroAdminConfirmedAtom = atom(false);
export const sttOutputAssetsAtom = atom<Asset[]>([]);
export const sttWalletInputsAtom = atom<WalletInputRef[]>([]);
export const sttWalletOutputsAtom = atom<WalletScriptOutputFormState[]>([]);
export const stagedSttTransfersAtom = atom<TransferFormState[]>([]);

// All transaction consumers read the live form as well as explicitly staged recipients.
// Writes edit only staged recipients, so batching never copies the live row twice.
export const sttExtraTransfersAtom = atom(
  (get): TransferFormState[] => {
    const staged = get(stagedSttTransfersAtom);
    const action = get(routeStateAtom).selectedAction;
    if (action !== "use" && action !== "use-allowance" && action !== "use-beneficiary") return staged;
    const mode = get(transferRecipientModeAtom);
    const customAddress = get(transferCustomAddressAtom);
    const displayAmount = get(transferDisplayAmountAtom);
    if (!mode && !customAddress && !displayAmount) return staged;
    const address = mode === "my-address"
      ? get(activeAddressAtom) ?? ""
      : mode.startsWith("recent:") ? mode.slice("recent:".length)
      : mode === "custom" ? customAddress : "";
    const unit = get(transferSelectedUnitAtom);
    const quantity = unit === "lovelace" ? parseAdaToLovelace(displayAmount) : displayAmount.trim();
    // Empty quantity remains invalid in field validation, but is safe for balance arithmetic.
    // Never discard a partial row: that could sign only the previous recipient silently.
    return [...staged, {
      address: address.trim(),
      amount: [{ unit, quantity: quantity && /^\d+$/.test(quantity) && BigInt(quantity) > 0n ? quantity : "" }],
      inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET }
    }];
  },
  (get, set, next: TransferFormState[] | ((current: TransferFormState[]) => TransferFormState[])) => {
    set(stagedSttTransfersAtom, typeof next === "function" ? next(get(stagedSttTransfersAtom)) : next);
  }
);
export const sttProofOfLifeOverrideModeAtom = atom<ProofOfLifeOverrideMode>("auto");
export const sttProofOfLifeSpecificDateTimeAtom = atom("");
export const sttTransferAddressAtom = atom("");
export const sttTransferAmountsAtom = atom<Record<string, string>>({});
export const beneficiaryStreamStopIdAtom = atom("");
export const streamingPaymentPayoutAmountsAtom = atom<Record<string, string>>({});
export const selectedSttActionAtom = atom<SttSpendActionMode>("use");
export const activeSttStateFormAtom = atom(
  (get) => get(routeStateAtom).selectedAction === "update-state"
    ? get(updateStateFormAtom) ?? withBeneficiarySigningAddressesDerived(get(sttStateFormAtom))
    : get(sttStateFormAtom),
  (get, set, value: StateFormState) => {
    if (get(routeStateAtom).selectedAction === "update-state") {
      set(updateStateFormAtom, value);
    } else {
      set(sttStateFormAtom, value);
    }
  }
);
export const sttAuthorityPathAtom = atom<AuthorityPath>("admin");
export const consolidateAuthorityPathAtom = atom<ConsolidateAuthorityPath>("admin");
export const walletOperatorPathAtom = atom<OperatorAuthorityPath>("admin");

/** Reset every stt-spend form field to its default. */
export const resetSttSpendFormAtom = atom(null, (_get, set) => {
  set(sttInputTxHashAtom, "");
  set(sttInputOutputIndexAtom, "");
  set(sttStateFormAtom, createDefaultStateForm());
  set(updateStateFormAtom, null);
  set(sttZeroAdminConfirmedAtom, false);
  set(sttOutputAssetsAtom, []);
  set(sttWalletInputsAtom, []);
  set(sttWalletOutputsAtom, []);
  set(sttExtraTransfersAtom, []);
  set(sttProofOfLifeOverrideModeAtom, "auto");
  set(sttProofOfLifeSpecificDateTimeAtom, "");
  set(sttTransferAddressAtom, "");
  set(sttTransferAmountsAtom, {});
  set(streamingPaymentPayoutAmountsAtom, {});
  set(beneficiaryStreamStopIdAtom, "");
  set(selectedSttActionAtom, "use");
  set(sttAuthorityPathAtom, "admin");
  set(consolidateAuthorityPathAtom, "admin");
  set(walletOperatorPathAtom, "admin");
});
