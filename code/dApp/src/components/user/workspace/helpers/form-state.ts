import { DEFAULT_SAFETY_TIMER_MS } from "@/components/user/workspace/constants";
import {
  applyUserPreset,
  createDefaultBeneficiaryFormState,
  createDefaultStreamingPaymentFormState,
  createDefaultUserFormState,
  nextGeneratedId,
  type BeneficiaryFormState,
  type ProofOfLifeOverrideMode,
  type StateAssetAmountForm,
  type StateFormState,
  type StreamingPaymentFormState,
  type UserFormState,
  type UserPreset
} from "@/lib/contracts/state-form";
import { type WalletInputRef } from "@/lib/types/contracts";
import { parseAdaToLovelace } from "@/lib/units/lovelace";
import { OwnedMessageError } from "./build-errors";

// Parses the "specific" proof-of-life override timestamp from the form's string
// datetime, identically for the validation and build paths, which previously
// hand-synced this block (a drift hazard, since validation must agree with what
// gets signed). Returns the truncated POSIX-ms timestamp, or undefined when the
// override isn't "specific". The empty-date message differs per caller, so it's
// passed in; the parse-failure message is shared.
export function resolveProofOfLifeOverrideTimestamp(
  mode: ProofOfLifeOverrideMode,
  specificDateTime: string,
  emptyDateMessage: string
): number | undefined {
  if (mode !== "specific") {
    return undefined;
  }

  if (!specificDateTime.trim()) {
    // Owned validation copy supplied by the caller — expected, not an unexpected failure.
    throw new OwnedMessageError(emptyDateMessage);
  }

  const parsed = Number(specificDateTime);
  if (!Number.isSafeInteger(parsed)) {
    // Branded: this sentence is the app's own validation rule, so the failure reads as
    // expected (calm note, no console diagnostic) rather than as an unexpected error.
    throw new OwnedMessageError("The proof of life date must be a real date and time.");
  }

  return Math.trunc(parsed);
}

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

export function createDefaultWalletInputRef(): WalletInputRef {
  return {
    txHash: "",
    outputIndex: 0
  };
}

export function defaultSafetyUnlockTimestamp(nowMs: number) {
  return String(nowMs + DEFAULT_SAFETY_TIMER_MS);
}

export function withSafetyTimerDefaults(
  form: StateFormState,
  nowMs: number
): StateFormState {
  return {
    ...form,
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime:
      form.proofOfLifeUnlockTime.trim() || defaultSafetyUnlockTimestamp(nowMs),
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement:
      form.proofOfLifeIncrement.trim() || String(DEFAULT_SAFETY_TIMER_MS)
  };
}

export function withSafetyTimerEnabled(
  form: StateFormState,
  enabled: boolean,
  nowMs: number
): StateFormState {
  if (enabled) {
    return withSafetyTimerDefaults(form, nowMs);
  }

  return {
    ...form,
    proofOfLifeUnlockTimeMode: "none",
    proofOfLifeIncrementMode: "none"
  };
}

export function withProofOfLifeUnlockTime(
  form: StateFormState,
  proofOfLifeUnlockTime: string,
  nowMs: number
): StateFormState {
  return {
    ...withSafetyTimerDefaults(form, nowMs),
    proofOfLifeUnlockTime
  };
}

export function withProofOfLifeIncrement(
  form: StateFormState,
  proofOfLifeIncrement: string,
  nowMs: number
): StateFormState {
  return {
    ...withSafetyTimerDefaults(form, nowMs),
    proofOfLifeIncrement
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


/**
 * Turn the approval rule on or off, filling a working number when it goes on.
 *
 * The contract rejects a zero threshold as a vacuous pass (`required_power > 0`,
 * `smart-contract/lib/state/configuration.ak:292`), so "on" with an empty box is an
 * approval path that can never be met. Both surfaces that carry this setting share this
 * helper so they cannot drift apart.
 */
export function withMultiApprovalEnabled(
  form: StateFormState,
  enabled: boolean
): StateFormState {
  return {
    ...form,
    multiSigThresholdMode: enabled ? "some" : "none",
    multiSigThreshold:
      enabled && !form.multiSigThreshold.trim() ? "2" : form.multiSigThreshold
  };
}

type AddableUserPreset = Extract<UserPreset, "admin" | "limited-withdrawal">;

export function withUserAdded(
  form: StateFormState,
  preset: AddableUserPreset,
  walletId?: string | null
): StateFormState {
  const normalizedWalletId = walletId?.trim() ?? "";
  const user = applyUserPreset(
    {
      ...createDefaultUserFormState(nextGeneratedId(form.users)),
      wallets: normalizedWalletId ? [normalizedWalletId] : []
    },
    preset
  );

  return {
    ...form,
    users: [...form.users, user]
  };
}

export function withRecoveryContactAdded(
  form: StateFormState,
  nowMs: number
): StateFormState {
  return withSafetyTimerDefaults(
    {
      ...form,
      beneficiaries: [
        ...form.beneficiaries,
        createDefaultBeneficiaryFormState(nextGeneratedId(form.beneficiaries))
      ]
    },
    nowMs
  );
}

export function withScheduledPaymentAdded(form: StateFormState): StateFormState {
  return {
    ...form,
    streamingPayments: [
      ...form.streamingPayments,
      createDefaultStreamingPaymentFormState(nextGeneratedId(form.streamingPayments))
    ]
  };
}

export function withUserAdminEnabled(user: UserFormState, enabled: boolean): UserFormState {
  return {
    ...user,
    isAdmin: enabled,
    canRenewProofOfLife: enabled ? true : user.canRenewProofOfLife
  };
}

export function withApprovalPowerEnabled(
  user: UserFormState,
  enabled: boolean
): UserFormState {
  return {
    ...user,
    multiSigPowerMode: enabled ? "some" : "none"
  };
}

export function approvalPowerForUser(user: UserFormState): number {
  if (user.multiSigPowerMode !== "some") {
    return 0;
  }

  const parsed = Number.parseInt(user.multiSigPower, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function reachableApprovalPower(users: readonly UserFormState[]): number {
  return users.reduce(
    (total, user) => total + (user.wallets.length > 0 ? approvalPowerForUser(user) : 0),
    0
  );
}

export function isAdaScheduledPayment(payment: StreamingPaymentFormState): boolean {
  return !payment.policyId.trim() && !payment.assetName.trim();
}

function scaleIntegerDigits(value: string, multiply: number, divide: number): string {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  return ((BigInt(trimmed) * BigInt(multiply)) / BigInt(divide)).toString();
}

export function scheduledPaymentRateForPeriod(
  payment: StreamingPaymentFormState,
  periodDays: number
): string {
  return scaleIntegerDigits(payment.amountPerDay, periodDays, 1);
}

export function withScheduledPaymentRate(
  payment: StreamingPaymentFormState,
  enteredRate: string,
  periodDays: number
): StreamingPaymentFormState {
  const perPeriodRate = isAdaScheduledPayment(payment)
    ? parseAdaToLovelace(enteredRate) ?? "0"
    : enteredRate;

  return {
    ...payment,
    amountPerDay: scaleIntegerDigits(perPeriodRate, 1, periodDays)
  };
}
