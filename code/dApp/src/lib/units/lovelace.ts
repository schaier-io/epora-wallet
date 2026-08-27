// Canonical home for lovelace <-> ADA conversion and formatting.
//
// Cardano's native unit is the lovelace (1 ADA = 1,000,000 lovelace). On-chain
// amounts are integers-as-strings (or bigint) to stay exact; display and chart
// math live here so there is exactly one implementation of each conversion.

export const LOVELACE_PER_ADA = 1_000_000n;

// Float variant for chart aggregates and other numeric (non-display) math where
// a Number is required. Lossy for amounts beyond Number.MAX_SAFE_INTEGER, so never
// use it to compute a value that gets signed or submitted on-chain.
export const LOVELACE_PER_ADA_NUMBER = 1_000_000;

// 1 ADA, the default seed amount for a withdrawal form. Kept as the on-chain
// string form so it drops straight into a lovelace-typed field/atom.
export const DEFAULT_WITHDRAWAL_LOVELACE = "1000000";

// Lossy lovelace -> ADA as a Number, for chart series and aggregates only.
export function lovelaceToAdaNumber(value: string | bigint | number): number {
  return Number(value) / LOVELACE_PER_ADA_NUMBER;
}

// Exact lovelace -> ADA string with thousands separators, e.g. "1,234.5". No
// currency symbol (callers append "₳" where they want it). Falls back to the raw
// input if it can't be parsed as an integer.
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

// Like formatLovelaceAsAda but rounded to `fractionDigits` decimals (banker's
// half-up), for compact balance displays.
export function formatLovelaceAsAdaRounded(
  value: string | bigint,
  fractionDigits = 1
) {
  try {
    const lovelace = typeof value === "bigint" ? value : BigInt(value);
    const sign = lovelace < 0n ? "-" : "";
    const absolute = lovelace < 0n ? -lovelace : lovelace;

    // Lovelace resolves to 6 decimal places, so clamp there: a larger scale
    // (10 ** digits) would exceed LOVELACE_PER_ADA, truncate roundingFactor to
    // 0n, and divide by zero, which the catch would silently swallow.
    const digits = Math.min(Math.trunc(fractionDigits), 6);

    if (digits <= 0) {
      const roundedWhole = (absolute + LOVELACE_PER_ADA / 2n) / LOVELACE_PER_ADA;
      return `${sign}${roundedWhole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }

    const scale = 10n ** BigInt(digits);
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

    return `${sign}${formattedWhole}.${fraction.toString().padStart(digits, "0")}`;
  } catch {
    return formatLovelaceAsAda(value);
  }
}

// ADA string (accepts thousands separators, up to 6 decimals) -> lovelace string.
// Returns null when the input isn't a well-formed ADA amount.
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
