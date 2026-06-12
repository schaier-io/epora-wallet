import { DEFAULT_OPTIONAL_CONSTR_PRESET, DEFAULT_SAFETY_TIMER_MS } from "@/components/user/workspace/constants";
import { type TransferFormState } from "@/components/user/workspace/types";
import { type BeneficiaryFormState, type StateAssetAmountForm, type StateFormState, type StreamingPaymentFormState, type UserFormState } from "@/lib/contracts/state-form";
import { type WalletInputRef } from "@/lib/types/contracts";

function cloneStateAssetAmounts(items: StateAssetAmountForm[]) {
  return items.map((item) => ({ ...item }));
}

function cloneUserForm(user: UserFormState): UserFormState {
  return {
    ...user,
    wallets: [...user.wallets],
    perDayAllowance: cloneStateAssetAmounts(user.perDayAllowance),
    remainingAllowance: cloneStateAssetAmounts(user.remainingAllowance)
  };
}

function cloneBeneficiaryForm(beneficiary: BeneficiaryFormState): BeneficiaryFormState {
  return {
    ...beneficiary,
    wallets: [...beneficiary.wallets]
  };
}

function cloneStreamingPaymentForm(streamingPayment: StreamingPaymentFormState): StreamingPaymentFormState {
  return { ...streamingPayment };
}

export function cloneStateForm(form: StateFormState): StateFormState {
  return {
    ...form,
    users: form.users.map(cloneUserForm),
    beneficiaries: form.beneficiaries.map(cloneBeneficiaryForm),
    streamingPayments: form.streamingPayments.map(cloneStreamingPaymentForm)
  };
}

export function createDefaultTransferFormState(): TransferFormState {
  return {
    address: "",
    amount: [],
    inlineDatum: { ...DEFAULT_OPTIONAL_CONSTR_PRESET }
  };
}

export function createDefaultWalletInputRef(): WalletInputRef {
  return {
    txHash: "",
    outputIndex: 0
  };
}

export function defaultSafetyUnlockTimestamp() {
  return String(Date.now() + DEFAULT_SAFETY_TIMER_MS);
}

export function withSafetyTimerDefaults(form: StateFormState): StateFormState {
  return {
    ...form,
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime:
      form.proofOfLifeUnlockTime.trim() || defaultSafetyUnlockTimestamp(),
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement:
      form.proofOfLifeIncrement.trim() || String(DEFAULT_SAFETY_TIMER_MS)
  };
}

export function safetyTimerIsReady(form: StateFormState) {
  return (
    form.proofOfLifeUnlockTimeMode === "some" &&
    form.proofOfLifeIncrementMode === "some" &&
    form.proofOfLifeUnlockTime.trim().length > 0 &&
    form.proofOfLifeIncrement.trim().length > 0
  );
}

