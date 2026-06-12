import type { UTxO } from "@meshsdk/core";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import type { TokenCapabilityMap } from "@/components/user/flow-types";
import type { Asset, PayoutTransfer, WalletInputRef } from "@/lib/types/contracts";

const GUIDED_USER_ACTION_KINDS = [
  "mint",
  "lock-funds",
  "use",
  "update-state",
  "manage-streaming-payments",
  "use-allowance",
  "use-beneficiary",
  "payout-streaming-payment"
] as const;

const DURATION_UNITS = [
  { value: "days", label: "Days", milliseconds: 86_400_000n },
  { value: "hours", label: "Hours", milliseconds: 3_600_000n },
  { value: "minutes", label: "Minutes", milliseconds: 60_000n },
  { value: "milliseconds", label: "Milliseconds", milliseconds: 1n }
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

const LOVELACE_PER_ADA = 1_000_000n;
const MAX_RECENT_RECIPIENTS = 5;

const DURATION_UNIT_MAP = Object.fromEntries(
  DURATION_UNITS.map((unit) => [unit.value, unit.milliseconds])
) as Record<DurationUnit, bigint>;

function readPositiveBigInt(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  return BigInt(normalized);
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

export function formatLovelaceAsAda(value: string | bigint) {
  try {
    const lovelace = typeof value === "bigint" ? value : BigInt(value);
    const sign = lovelace < 0n ? "-" : "";
    const absolute = lovelace < 0n ? -lovelace : lovelace;
    const whole = absolute / LOVELACE_PER_ADA;
    const fraction = (absolute % LOVELACE_PER_ADA)
      .toString()
      .padStart(6, "0")
      .replace(/0+$/, "");
    const formattedWhole = whole
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return fraction.length > 0 ? `${sign}${formattedWhole}.${fraction}` : `${sign}${formattedWhole}`;
  } catch {
    return typeof value === "bigint" ? value.toString() : value;
  }
}

export function formatLovelaceAsAdaRounded(
  value: string | bigint,
  fractionDigits = 1
) {
  try {
    const lovelace = typeof value === "bigint" ? value : BigInt(value);
    const sign = lovelace < 0n ? "-" : "";
    const absolute = lovelace < 0n ? -lovelace : lovelace;

    if (fractionDigits <= 0) {
      const roundedWhole = (absolute + LOVELACE_PER_ADA / 2n) / LOVELACE_PER_ADA;
      return `${sign}${roundedWhole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }

    const scale = 10n ** BigInt(fractionDigits);
    const roundingFactor = LOVELACE_PER_ADA / scale;
    const roundedScaled = (absolute + roundingFactor / 2n) / roundingFactor;
    const whole = roundedScaled / scale;
    const fraction = roundedScaled % scale;
    const formattedWhole = whole
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    if (fraction === 0n) {
      return `${sign}${formattedWhole}`;
    }

    return `${sign}${formattedWhole}.${fraction.toString().padStart(fractionDigits, "0")}`;
  } catch {
    return formatLovelaceAsAda(value);
  }
}

export function parseAdaToLovelace(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt((fractionPart + "000000").slice(0, 6) || "0");

  return (whole * LOVELACE_PER_ADA + fraction).toString();
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
    badges.push("Admin");
  }
  if (capabilityMap.hasDirectUserMatch) {
    badges.push("Allowance");
  }
  if (capabilityMap.hasBeneficiaryMatch) {
    badges.push("Recovery");
  }
  if (capabilityMap.hasStreamingPayments) {
    badges.push("Streaming");
  }

  if (badges.length === 0) {
    badges.push("Receive only");
  }

  return badges;
}

export function resolveAutomaticSendPath(
  capabilityMap: TokenCapabilityMap | null
): "use" | "use-allowance" | "use-beneficiary" {
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
    return "use-beneficiary";
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

export function buildStreamingPaymentPayoutTransfer(
  streamingPayment: StreamingPaymentFormState,
  quantity: string,
  sttInputTxHash: string,
  sttInputOutputIndex: number
): PayoutTransfer {
  const unit =
    streamingPayment.policyId.trim() && streamingPayment.assetName.trim()
      ? `${streamingPayment.policyId.trim()}${streamingPayment.assetName.trim()}`
      : "lovelace";

  return {
    address: streamingPayment.payoutAddress.trim(),
    amount: [{ unit, quantity: quantity.trim() }],
    inlineDatum: {
      alternative: 0,
      fields: [
        Number(streamingPayment.id.trim() || "0"),
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
  const remaining = toAssetTotals([requestedAssets]);
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

export function requestedTransferAssets(transfers: PayoutTransfer[]): Asset[] {
  return sumAssetsByUnit(transfers.map((transfer) => transfer.amount));
}
