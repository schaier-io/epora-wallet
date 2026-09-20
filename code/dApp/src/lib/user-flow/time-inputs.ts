import { readPositiveBigInt } from "@/lib/user-flow/asset-quantities";

const DURATION_UNITS = [
  { value: "days", milliseconds: 86_400_000n },
  { value: "hours", milliseconds: 3_600_000n },
  { value: "minutes", milliseconds: 60_000n },
  { value: "milliseconds", milliseconds: 1n }
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

export const DURATION_UNIT_MAP = Object.fromEntries(
  DURATION_UNITS.map((unit) => [unit.value, unit.milliseconds])
) as Record<DurationUnit, bigint>;

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
