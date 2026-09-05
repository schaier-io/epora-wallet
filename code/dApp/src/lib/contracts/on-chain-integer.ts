export const MAX_ON_CHAIN_STATE_INTEGER = 18_446_744_073_709_551_615n;
const MAX_ON_CHAIN_STATE_INTEGER_DECIMAL = MAX_ON_CHAIN_STATE_INTEGER.toString();

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
