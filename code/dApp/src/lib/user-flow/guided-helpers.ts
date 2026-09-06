import type { UTxO } from "@meshsdk/core";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import type { TokenCapabilityMap } from "@/components/user/flow-types";
import type { Asset, PayoutTransfer, WalletInputRef } from "@/lib/types/contracts";
import {
  calculateMinimumLovelaceForOutput,
  getLovelaceQuantity
} from "@/lib/mesh/transactions/internals/value";
import {
  assertNonNegativeUint64,
  isNonNegativeUint64Decimal,
  type OnChainInteger
} from "@/lib/contracts/on-chain-integer";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibUserFlowGuidedHelpers.json";

const i18n = createDefaultTranslator("LibUserFlowGuidedHelpers", defaultMessages);

// Lovelace/ADA formatting lives in the canonical units module; re-exported here
// so the many existing guided-flow call sites keep working unchanged.
export {
  formatLovelaceAsAda,
  formatLovelaceAsAdaRounded,
  parseAdaToLovelace
} from "@/lib/units/lovelace";

const GUIDED_USER_ACTION_KINDS = [
  "mint",
  "lock-funds",
  "use",
  "update-state",
  "manage-streaming-payments",
  "use-allowance",
  "use-beneficiary",
  "exit-beneficiary",
  "stop-beneficiary-stream",
  "payout-streaming-payment"
] as const;

const DURATION_UNITS = [
  { value: "days", label: i18n("days"), milliseconds: 86_400_000n },
  { value: "hours", label: i18n("hours"), milliseconds: 3_600_000n },
  { value: "minutes", label: i18n("minutes"), milliseconds: 60_000n },
  { value: "milliseconds", label: i18n("milliseconds"), milliseconds: 1n }
] as const;

export type DurationUnit = (typeof DURATION_UNITS)[number]["value"];

export type DurationParts = {
  amount: string;
  unit: DurationUnit;
};

export type LocalDateTimeParts = {
  date: string;
  time: string;
};

const MAX_RECENT_RECIPIENTS = 5;

const DURATION_UNIT_MAP = Object.fromEntries(
  DURATION_UNITS.map((unit) => [unit.value, unit.milliseconds])
) as Record<DurationUnit, bigint>;

function readPositiveBigInt(value: string) {
  const normalized = value.trim();
  if (!isNonNegativeUint64Decimal(normalized)) {
    return null;
  }

  return BigInt(normalized);
}

function toOnChainInteger(value: bigint, label: string): OnChainInteger {
  assertNonNegativeUint64(value, label);
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber) ? asNumber : value;
}

function toAssetTotals(amounts: Asset[][]) {
  const totals = new Map<string, bigint>();

  for (const amount of amounts) {
    for (const asset of amount) {
      const quantity = readPositiveBigInt(asset.quantity);
      if (quantity === null || quantity <= 0n) {
        continue;
      }

      totals.set(asset.unit, (totals.get(asset.unit) ?? 0n) + quantity);
    }
  }

  return totals;
}

function serializeAssetTotals(totals: Map<string, bigint>): Asset[] {
  return [...totals.entries()]
    .filter(([, quantity]) => quantity > 0n)
    .sort(([leftUnit], [rightUnit]) => {
      if (leftUnit === "lovelace") return -1;
      if (rightUnit === "lovelace") return 1;
      return leftUnit.localeCompare(rightUnit);
    })
    .map(([unit, quantity]) => ({ unit, quantity: quantity.toString() }));
}

function nativeAssetCount(amount: Asset[]) {
  return amount.filter((asset) =>
    asset.unit !== "lovelace" && asset.unit !== "" && BigInt(asset.quantity) > 0n
  ).length;
}


export function rememberRecentRecipient(
  recipients: string[],
  address: string,
  maxEntries = MAX_RECENT_RECIPIENTS
) {
  const normalized = address.trim();
  if (!normalized) {
    return recipients;
  }

  return [normalized, ...recipients.filter((entry) => entry !== normalized)].slice(0, maxEntries);
}

export function chooseAutoOpenDetectedWallet<T extends { unit: string }>(wallets: T[]) {
  return wallets.length === 1 ? wallets[0]?.unit ?? null : null;
}

export function derivePermissionWalletBadgeLabels(
  capabilityMap: TokenCapabilityMap
) {
  const badges: string[] = [];

  if (capabilityMap.hasDirectAdminSigner) {
    badges.push("Owner");
  }
  if (capabilityMap.hasDirectUserMatch) {
    badges.push("Allowance");
  }
  if (capabilityMap.hasBeneficiaryMatch) {
    badges.push("Recovery");
  }
  if (capabilityMap.hasStreamingPayments) {
    badges.push("Scheduled");
  }

  if (badges.length === 0) {
    badges.push("Receive only");
  }

  return badges;
}

export function resolveAutomaticSendPath(
  capabilityMap: TokenCapabilityMap | null
): "use" | "use-allowance" | "exit-beneficiary" {
  if (!capabilityMap) {
    return "use";
  }

  if (
    capabilityMap.hasDirectAdminSigner &&
    capabilityMap.availableOperatorPaths.length > 0
  ) {
    return "use";
  }

  if (capabilityMap.hasDirectUserMatch) {
    return "use-allowance";
  }

  if (capabilityMap.hasBeneficiaryMatch) {
    return "exit-beneficiary";
  }

  if (capabilityMap.availableOperatorPaths.length > 0) {
    return "use";
  }

  return "use";
}

export function deriveWalletHomeFlowAvailability(
  capabilityMap: TokenCapabilityMap | null
) {
  const hasOperatorManagement = capabilityMap
    ? capabilityMap.availableOperatorPaths.length > 0
    : false;
  const canSend = Boolean(
    capabilityMap &&
      (capabilityMap.availableOperatorPaths.length > 0 ||
        capabilityMap.hasDirectUserMatch ||
        capabilityMap.hasBeneficiaryMatch)
  );

  return {
    canSend,
    canAddFunds: true,
    canManagePeople: hasOperatorManagement,
    canManageSettings: hasOperatorManagement,
    canPayStreamingPayments: Boolean(capabilityMap?.hasStreamingPayments),
    canManageStreamingPayments: hasOperatorManagement
  };
}

function sumAssetsByUnit(amounts: Asset[][]): Asset[] {
  return serializeAssetTotals(toAssetTotals(amounts));
}

export function filterGuidedUserActions<T extends { kind: string }>(actions: T[]) {
  const allowed = new Set<string>(GUIDED_USER_ACTION_KINDS);
  return actions.filter((action) => allowed.has(action.kind));
}

export function splitTimestampToLocalInputParts(value: string): LocalDateTimeParts {
  const timestamp = readPositiveBigInt(value);
  if (timestamp === null || timestamp <= 0n) {
    return { date: "", time: "" };
  }

  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }

  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60_000);
  const iso = localDate.toISOString();

  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16)
  };
}

export function combineLocalDateAndTimeToTimestamp(
  date: string,
  time: string
): string {
  const normalizedDate = date.trim();
  const normalizedTime = time.trim();
  if (!normalizedDate || !normalizedTime) {
    return "";
  }

  const parsed = new Date(`${normalizedDate}T${normalizedTime}`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return Math.trunc(parsed.getTime()).toString();
}

export function splitDurationMillis(value: string): DurationParts {
  const duration = readPositiveBigInt(value);
  if (duration === null) {
    return { amount: "", unit: "days" };
  }

  for (const unit of DURATION_UNITS) {
    if (duration % unit.milliseconds === 0n) {
      return {
        amount: (duration / unit.milliseconds).toString(),
        unit: unit.value
      };
    }
  }

  return {
    amount: duration.toString(),
    unit: "milliseconds"
  };
}

export function combineDurationToMillis(amount: string, unit: DurationUnit): string {
  const quantity = readPositiveBigInt(amount);
  if (quantity === null) {
    return "";
  }

  return (quantity * DURATION_UNIT_MAP[unit]).toString();
}

export function computeStreamingPaymentDueAmount(
  streamingPayment: StreamingPaymentFormState,
  referenceTimeMs: number
): string {
  const paidOut = readPositiveBigInt(streamingPayment.paidOutAmount);
  const amountPerDay = readPositiveBigInt(streamingPayment.amountPerDay);
  const startDate = readPositiveBigInt(streamingPayment.startDate);
  const endDate = readPositiveBigInt(streamingPayment.endDate);

  if (
    paidOut === null ||
    amountPerDay === null ||
    startDate === null ||
    endDate === null
  ) {
    return "0";
  }

  const effectiveEndDate = endDate < BigInt(referenceTimeMs) ? endDate : BigInt(referenceTimeMs);
  if (effectiveEndDate <= startDate) {
    return "0";
  }

  const totalEarned =
    ((effectiveEndDate - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  const dueAmount = totalEarned - paidOut;

  return dueAmount > 0n ? dueAmount.toString() : "0";
}

/**
 * Everything this stream still owes anyone at `referenceTimeMs`: the accrued-but-unpaid
 * due plus everything that will still accrue until the end date. A wallet holding funds
 * that back a stream cannot spend them, so an "actually available" balance is the raw
 * balance minus this. `paidOutAmount` is what has been paid as of now, so the unpaid
 * part at a historical point is an approximation -- the schedule is what the chart can
 * know, not the payout history.
 */
export function computeStreamingPaymentRemainingObligation(
  streamingPayment: StreamingPaymentFormState,
  referenceTimeMs: number
): string {
  const paidOut = readPositiveBigInt(streamingPayment.paidOutAmount);
  const amountPerDay = readPositiveBigInt(streamingPayment.amountPerDay);
  const startDate = readPositiveBigInt(streamingPayment.startDate);
  const endDate = readPositiveBigInt(streamingPayment.endDate);

  if (
    paidOut === null ||
    amountPerDay === null ||
    startDate === null ||
    endDate === null ||
    endDate <= startDate
  ) {
    return "0";
  }

  const now = BigInt(referenceTimeMs);
  // Clamp now into [start, end]: before the start nothing has accrued and the whole
  // lifetime is still encumbered; after the end everything has accrued and only the
  // unpaid remainder is owed.
  const accrualEnd = now > endDate ? endDate : now;
  const accrualStart = accrualEnd < startDate ? startDate : accrualEnd;

  const accruedBy = ((accrualStart - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  const lifetime = ((endDate - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  const unpaid = accruedBy > paidOut ? accruedBy - paidOut : 0n;

  return (unpaid + lifetime - accruedBy).toString();
}

function computeStreamingPaymentReserveQuantity(
  streamingPayment: StreamingPaymentFormState,
  referenceTimeMs: number
): bigint {
  const paidOut = readPositiveBigInt(streamingPayment.paidOutAmount);
  const amountPerDay = readPositiveBigInt(streamingPayment.amountPerDay);
  const startDate = readPositiveBigInt(streamingPayment.startDate);
  const endDate = readPositiveBigInt(streamingPayment.endDate);

  if (
    paidOut === null ||
    amountPerDay === null ||
    startDate === null ||
    endDate === null ||
    endDate < startDate
  ) {
    return 0n;
  }

  const lifetime = ((endDate - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  if (paidOut >= lifetime) {
    return 0n;
  }

  const referenceTime = BigInt(referenceTimeMs);
  if (referenceTime < startDate) {
    return 0n;
  }

  const accrualEnd = referenceTime < endDate ? referenceTime : endDate;
  const accrued = ((accrualEnd - startDate) * amountPerDay) / DURATION_UNIT_MAP.days;
  const reserve = accrued + 1n - paidOut;
  return reserve > 0n ? reserve : 0n;
}

export function computeStreamingPaymentLifetimeAmount(
  streamingPayment: StreamingPaymentFormState
): string | null {
  const amountPerDay = readPositiveBigInt(streamingPayment.amountPerDay);
  const startDate = readPositiveBigInt(streamingPayment.startDate);
  const endDate = readPositiveBigInt(streamingPayment.endDate);

  if (
    amountPerDay === null ||
    startDate === null ||
    endDate === null ||
    endDate < startDate
  ) {
    return null;
  }

  return (
    ((endDate - startDate) * amountPerDay) /
    DURATION_UNIT_MAP.days
  ).toString();
}

/** True when the payout validator requires this input entry to be removed. */
export function streamingPaymentNeedsZeroDeltaCleanup(
  streamingPayment: StreamingPaymentFormState
): boolean {
  const paidOutAmount = readPositiveBigInt(streamingPayment.paidOutAmount);
  const lifetimeAmount = computeStreamingPaymentLifetimeAmount(streamingPayment);

  return (
    paidOutAmount !== null &&
    lifetimeAmount !== null &&
    paidOutAmount >= BigInt(lifetimeAmount)
  );
}

/** The asset unit a stream pays: an empty policy id means plain ADA. */
export function streamingPaymentUnit(streamingPayment: StreamingPaymentFormState): string {
  const policyId = streamingPayment.policyId.trim();
  return policyId
    ? `${policyId}${streamingPayment.assetName.trim()}`
    : "lovelace";
}

/** Exact per-asset reserve used by the wallet validator at the transaction upper bound. */
export function computeStreamingReserveAssets(
  streamingPayments: StreamingPaymentFormState[],
  referenceTimeMs: number
): Asset[] {
  const totals = new Map<string, bigint>();

  for (const streamingPayment of streamingPayments) {
    const quantity = computeStreamingPaymentReserveQuantity(
      streamingPayment,
      referenceTimeMs
    );
    if (quantity > 0n) {
      const unit = streamingPaymentUnit(streamingPayment);
      totals.set(unit, (totals.get(unit) ?? 0n) + quantity);
    }
  }

  return serializeAssetTotals(totals);
}

export function buildStreamingPaymentPayoutTransfer(
  streamingPayment: StreamingPaymentFormState,
  quantity: string,
  sttInputTxHash: string,
  sttInputOutputIndex: number
): PayoutTransfer {
  const unit = streamingPaymentUnit(streamingPayment);
  const streamingPaymentId = readPositiveBigInt(streamingPayment.id);
  if (streamingPaymentId === null) {
    throw new Error("Scheduled payment payout id must be a non-negative integer.");
  }

  return {
    address: streamingPayment.payoutAddress.trim(),
    amount: [{ unit, quantity: quantity.trim() }],
    inlineDatum: {
      alternative: 0,
      fields: [
        toOnChainInteger(streamingPaymentId, "Scheduled payment payout id"),
        sttInputTxHash,
        sttInputOutputIndex
      ]
    }
  };
}

function scoreUtxoAgainstRemaining(utxo: UTxO, remaining: Map<string, bigint>) {
  let fullUnitsCovered = 0;
  let partialUnitsCovered = 0;
  let lovelaceCovered = 0n;

  for (const asset of utxo.output.amount) {
    const quantity = readPositiveBigInt(asset.quantity);
    const remainingQuantity = remaining.get(asset.unit) ?? 0n;

    if (quantity === null || quantity <= 0n || remainingQuantity <= 0n) {
      continue;
    }

    const covered = quantity < remainingQuantity ? quantity : remainingQuantity;
    partialUnitsCovered += 1;
    if (covered === remainingQuantity) {
      fullUnitsCovered += 1;
    }
    if (asset.unit === "lovelace") {
      lovelaceCovered += covered;
    }
  }

  return {
    fullUnitsCovered,
    partialUnitsCovered,
    lovelaceCovered
  };
}

export function suggestWalletInputsForRequestedAssets(
  utxos: UTxO[],
  requestedAssets: Asset[]
): WalletInputRef[] {
  return suggestWalletInputsForRequiredTotals(
    utxos,
    toAssetTotals([requestedAssets])
  );
}

function suggestWalletInputsForRequiredTotals(
  utxos: UTxO[],
  requiredTotals: Map<string, bigint>
): WalletInputRef[] {
  const remaining = new Map(requiredTotals);
  const selections: WalletInputRef[] = [];
  const usedIndexes = new Set<number>();

  while ([...remaining.values()].some((quantity) => quantity > 0n)) {
    let bestIndex = -1;
    let bestScore: ReturnType<typeof scoreUtxoAgainstRemaining> | null = null;

    utxos.forEach((utxo, index) => {
      if (usedIndexes.has(index)) {
        return;
      }

      const score = scoreUtxoAgainstRemaining(utxo, remaining);
      if (score.partialUnitsCovered === 0) {
        return;
      }

      if (
        !bestScore ||
        score.fullUnitsCovered > bestScore.fullUnitsCovered ||
        (score.fullUnitsCovered === bestScore.fullUnitsCovered &&
          score.partialUnitsCovered > bestScore.partialUnitsCovered) ||
        (score.fullUnitsCovered === bestScore.fullUnitsCovered &&
          score.partialUnitsCovered === bestScore.partialUnitsCovered &&
          score.lovelaceCovered > bestScore.lovelaceCovered)
      ) {
        bestIndex = index;
        bestScore = score;
      }
    });

    if (bestIndex < 0) {
      return [];
    }

    const selectedUtxo = utxos[bestIndex]!;
    usedIndexes.add(bestIndex);
    selections.push({
      txHash: selectedUtxo.input.txHash,
      outputIndex: selectedUtxo.input.outputIndex
    });

    for (const asset of selectedUtxo.output.amount) {
      const quantity = readPositiveBigInt(asset.quantity);
      const remainingQuantity = remaining.get(asset.unit) ?? 0n;

      if (quantity === null || quantity <= 0n || remainingQuantity <= 0n) {
        continue;
      }

      const nextQuantity = remainingQuantity - quantity;
      if (nextQuantity > 0n) {
        remaining.set(asset.unit, nextQuantity);
      } else {
        remaining.delete(asset.unit);
      }
    }
  }

  return selections;
}

/**
 * Input suggestion for a wallet spend.
 *
 * Select enough UTxOs to cover every requested asset and leave its exact
 * per-asset streaming reserve and minimum ADA for the continuing output.
 * Return no suggestion when the loaded inputs cannot fund that requirement.
 */
export function suggestLockedInputsForSpend(
  utxos: UTxO[],
  requestedAssets: Asset[],
  streamingReserve: Asset[] = [],
  continuingOutputAddress?: string
): WalletInputRef[] {
  const requestedTotals = toAssetTotals([requestedAssets]);
  if (requestedTotals.size === 0) {
    return [];
  }

  const reserveTotals = toAssetTotals([streamingReserve]);
  const requiredTotals = new Map(
    [...requestedTotals].map(([unit, quantity]) => [
      unit,
      quantity + (reserveTotals.get(unit) ?? 0n)
    ])
  );

  const selections = suggestWalletInputsForRequiredTotals(utxos, requiredTotals);
  if (selections.length === 0) return [];

  const selectedRefs = new Set(
    selections.map((ref) => `${ref.txHash}#${ref.outputIndex}`)
  );
  const selectedUtxos = utxos.filter((utxo) =>
    selectedRefs.has(`${utxo.input.txHash}#${utxo.input.outputIndex}`)
  );
  const extraUtxos = utxos.filter((utxo) =>
    !selectedRefs.has(`${utxo.input.txHash}#${utxo.input.outputIndex}`) &&
    getLovelaceQuantity(utxo.output.amount) > 0n
  ).sort((left, right) => {
    const nativeDifference = nativeAssetCount(left.output.amount) -
      nativeAssetCount(right.output.amount);
    if (nativeDifference !== 0) return nativeDifference;
    const difference = getLovelaceQuantity(left.output.amount) -
      getLovelaceQuantity(right.output.amount);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  });

  for (;;) {
    const remainder = toAssetTotals(selectedUtxos.map((utxo) => utxo.output.amount));
    for (const [unit, quantity] of requestedTotals) {
      remainder.set(unit, (remainder.get(unit) ?? 0n) - quantity);
    }
    const amount = serializeAssetTotals(remainder);
    if (amount.length === 0) return selections;
    const minimumLovelace = calculateMinimumLovelaceForOutput({
      address: continuingOutputAddress ?? selectedUtxos[0]!.output.address,
      amount
    });
    if (getLovelaceQuantity(amount) >= minimumLovelace) return selections;

    // Keep change above its ledger minimum without a funding-wallet top-up:
    // payout and allowance validators require the exact declared value delta.
    const extra = extraUtxos.shift();
    if (!extra) return [];
    selectedUtxos.push(extra);
    selections.push({ ...extra.input });
  }
}

export function maximumAdaSpendWithChange(
  utxos: UTxO[],
  requestedQuantity: bigint,
  continuingOutputAddress?: string
): bigint {
  const remainder = toAssetTotals(utxos.map((utxo) => utxo.output.amount));
  const available = remainder.get("lovelace") ?? 0n;
  const requested = requestedQuantity < available ? requestedQuantity : available;
  if (requested <= 0n) return 0n;
  remainder.set("lovelace", available - requested);
  const amount = serializeAssetTotals(remainder);
  if (amount.length === 0) return requested;

  const minimumLovelace = calculateMinimumLovelaceForOutput({
    address: continuingOutputAddress ?? utxos[0]!.output.address,
    amount
  });
  const spendable = available - minimumLovelace;
  if (spendable <= 0n) return 0n;
  return spendable < requested ? spendable : requested;
}

export function requestedTransferAssets(transfers: PayoutTransfer[]): Asset[] {
  return sumAssetsByUnit(transfers.map((transfer) => transfer.amount));
}
