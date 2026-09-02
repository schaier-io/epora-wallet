import type { FieldErrors } from "@/components/user/flow-types";

export function formatIntegerUnits(value: string) {
  try {
    return new Intl.NumberFormat("en-US").format(BigInt(value));
  } catch {
    return value;
  }
}

export function roundedIntegerUnitsFormatter(value: number) {
  return formatIntegerUnits(Math.round(value).toString());
}

export function formatUsagePercent(used: string, max: string) {
  try {
    const usedValue = BigInt(used);
    const maxValue = BigInt(max);

    if (maxValue === 0n) {
      return "0.00";
    }

    const hundredths = (usedValue * 10000n) / maxValue;
    const whole = hundredths / 100n;
    const fraction = (hundredths % 100n).toString().padStart(2, "0");
    return `${whole.toString()}.${fraction}`;
  } catch {
    return "0.00";
  }
}

export function formatValidatorTitle(value: string) {
  const parts = value.split(".");

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }

  return value;
}

export function parseSafeIntegerCount(value: string) {
  try {
    const parsed = BigInt(value);

    if (
      parsed > BigInt(Number.MAX_SAFE_INTEGER) ||
      parsed < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      return null;
    }

    return Number(parsed);
  } catch {
    return null;
  }
}

export function flattenFieldErrors(fieldErrors: FieldErrors) {
  return Object.entries(fieldErrors).flatMap(([key, messages]) =>
    messages.map((message) => ({ key, message }))
  );
}
