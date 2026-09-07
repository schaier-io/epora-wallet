export const MAX_ON_CHAIN_STATE_INTEGER = 18_446_744_073_709_551_615n;
const MAX_ON_CHAIN_STATE_INTEGER_DECIMAL = MAX_ON_CHAIN_STATE_INTEGER.toString();

export type OnChainInteger = number | bigint;

export function isOnChainInteger(value: unknown): value is OnChainInteger {
  return (
    typeof value === "bigint" ||
    (typeof value === "number" && Number.isSafeInteger(value))
  );
}

export function toOnChainBigInt(value: unknown, label: string): bigint {
  if (!isOnChainInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  return BigInt(value);
}

export function isNonNegativeUint64Decimal(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > MAX_ON_CHAIN_STATE_INTEGER_DECIMAL.length ||
    !/^\d+$/.test(value)
  ) {
    return false;
  }

  return (
    value.length < MAX_ON_CHAIN_STATE_INTEGER_DECIMAL.length ||
    value <= MAX_ON_CHAIN_STATE_INTEGER_DECIMAL
  );
}

export function assertNonNegativeUint64(value: bigint, label: string): void {
  if (value < 0n || value > MAX_ON_CHAIN_STATE_INTEGER) {
    throw new Error(
      `${label} must be between 0 and ${MAX_ON_CHAIN_STATE_INTEGER.toString()}.`
    );
  }
}
