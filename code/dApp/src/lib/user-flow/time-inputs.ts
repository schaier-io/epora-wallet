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

export type DateTimeParts = {
  date: string;
  time: string;
};

export const DURATION_UNIT_MAP = Object.fromEntries(
  DURATION_UNITS.map((unit) => [unit.value, unit.milliseconds])
) as Record<DurationUnit, bigint>;

/**
 * Splits a stored millisecond timestamp into the two halves a `date` and a `time`
 * input carry, in `defaultTimeZone` (UTC).
 *
 * This used to shift by `getTimezoneOffset()`, so the two inputs held the reader's
 * own wall clock while every rendered timestamp in the app (all of them pinned to
 * `defaultTimeZone`, see `i18n/config.ts`) held UTC. The echo under the inputs then
 * read a UTC number and called it local. One zone for the whole column removes the
 * divergence; the echo names the zone so the number is never read as a local clock.
 *
 * The split is UTC because `toISOString()` is, which only matches the labels while
 * `defaultTimeZone` is "UTC". `time-inputs.test.ts` derives the expected halves from
 * `defaultTimeZone` itself and fails if that ever stops being true. It also pins its
 * own host zone off UTC, so a host-zone shift put back here fails on a UTC CI runner
 * too, where it would otherwise be a no-op.
 */
export function splitTimestampToInputParts(value: string): DateTimeParts {
  const timestamp = readPositiveBigInt(value);
  if (timestamp === null || timestamp <= 0n) {
    return { date: "", time: "" };
  }

  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }

  const iso = date.toISOString();

  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16)
  };
}

/** The inverse of `splitTimestampToInputParts`: both halves are read as UTC. */
export function combineDateAndTimeToTimestamp(
  date: string,
  time: string
): string {
  const normalizedDate = date.trim();
  const normalizedTime = time.trim();
  if (!normalizedDate || !normalizedTime) {
    return "";
  }

  const parsed = new Date(`${normalizedDate}T${normalizedTime}Z`);
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
