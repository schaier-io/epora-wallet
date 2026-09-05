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
import {
  isNonNegativeUint64Decimal,
  MAX_ON_CHAIN_STATE_INTEGER
} from "@/lib/contracts/on-chain-integer";
import { OwnedMessageError } from "./build-errors";

function readFormUint64(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const canonical = normalized.replace(/^0+(?=\d)/, "");
  return isNonNegativeUint64Decimal(canonical) ? BigInt(canonical) : null;
}

function configuredApprovalPower(users: readonly UserFormState[], requireWallet: boolean) {
  return users.reduce((total, user) => {
    if (
      user.multiSigPowerMode !== "some" ||
      (requireWallet && user.wallets.length === 0)
    ) {
      return total;
    }
    const power = readFormUint64(user.multiSigPower);
    return power !== null && power > 0n ? total + power : total;
  }, 0n);
}

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
 * The approval rule is the co-signer list, not a switch on top of it. A "No" next to
 * granted Co-signer chips could only mean the chips lie, and a "Yes" with no chips was a
 * threshold nobody held power toward — the old Yes/No let the two controls disagree.
 * The chips are the rule now: granting the first Co-signer chip turns the rule on,
 * revoking the last one turns it off.
 *
 * The contract rejects a zero threshold as a vacuous pass (`required_power > 0`,
 * `smart-contract/lib/state/configuration.ak:292`), so the first grant defaults the
 * threshold to exactly the power the named co-signers hold between them — "all of them
 * together", dialable down from there on the slider. Matching
 * `computeSignerSatisfaction`, power counts only where the chip is on and the power
 * itself is above zero.
 */
export function withMultisigDerivedFromCoSigners(form: StateFormState): StateFormState {
  const coSignerPower = configuredApprovalPower(form.users, false);
  if (coSignerPower <= 0n) {
    return form.multiSigThresholdMode === "none"
      ? form
      : { ...form, multiSigThresholdMode: "none" };
  }
  if (form.multiSigThresholdMode === "some") {
    return form;
  }
  return {
    ...form,
    multiSigThresholdMode: "some",
    multiSigThreshold: (coSignerPower > MAX_ON_CHAIN_STATE_INTEGER
      ? MAX_ON_CHAIN_STATE_INTEGER
      : coSignerPower).toString()
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

/**
 * Add a person who counts toward the approval threshold, offered right where the
 * threshold is set: the unreachable-threshold warning on that editor had no way to
 * act on itself, and nothing on either surface said co-signers are people.
 *
 * The new person's power covers what the current signers are short of the threshold
 * (the contract sums power, so one person holding 2 meets a threshold of 2); the
 * arithmetic warning then clears as soon as they have a wallet id to sign with.
 */
export function withCoSignerAdded(form: StateFormState): StateFormState {
  const needed = readFormUint64(form.multiSigThreshold);
  const shortOf = needed === null
    ? 1n
    : needed - configuredApprovalPower(form.users, true);
  const power = shortOf < 1n
    ? 1n
    : shortOf > MAX_ON_CHAIN_STATE_INTEGER
      ? MAX_ON_CHAIN_STATE_INTEGER
      : shortOf;
  const user = applyUserPreset(
    {
      ...createDefaultUserFormState(nextGeneratedId(form.users)),
      multiSigPowerMode: "some",
      multiSigPower: power.toString()
    },
    "custom"
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

  const parsed = readFormUint64(user.multiSigPower);
  if (parsed === null || parsed <= 0n) {
    return 0;
  }
  return parsed > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(parsed);
}

export function reachableApprovalPower(users: readonly UserFormState[]): number {
  const total = configuredApprovalPower(users, true);
  return total > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(total);
}

/**
 * The top of an approval-power slider, for the wallet threshold.
 *
 * The threshold is only worth setting up to the power the wallet can actually
 * reach (`reachableApprovalPower`), so that is the range. The floor of 2 keeps
 * the slider usable before anyone holds power.
 *
 * Deliberately blind to `multiSigThreshold` itself. A ceiling derived from the
 * number the slider writes would shrink under the pointer mid-drag, and each
 * shrink would drag the value further down. A stored number above this ceiling
 * is covered by the slider instead, which keeps its own range from the value it
 * first saw.
 */
export function approvalThresholdCeiling(form: StateFormState): number {
  return Math.max(2, reachableApprovalPower(form.users));
}

/**
 * The top of an approval-power slider, for one person's own power.
 *
 * The threshold is the range: power past it buys nothing, because
 * `multisig_threshold_is_met` only asks whether the sum reaches it. The floor
 * of 2 keeps the control from collapsing to a single stop on a wallet with no
 * threshold set yet.
 *
 * Blind to the powers people hold, for the reason above: a ceiling that counted
 * the number under the pointer would shrink as that number was dragged down.
 */
export function personApprovalPowerCeiling(form: StateFormState): number {
  const needed = readFormUint64(form.multiSigThreshold) ?? 0n;
  return Math.max(
    2,
    needed > BigInt(Number.MAX_SAFE_INTEGER)
      ? Number.MAX_SAFE_INTEGER
      : Number(needed)
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
