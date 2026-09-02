// Pure model for the cost rows the review rail shows before signing.
//
// A row exists only when its amount was actually produced upstream. Nothing here
// estimates a number the builders did not compute: `estimatedFeeLovelace` comes from
// the built transaction, the wallet balance from the last funds refresh. Minimum-UTxO,
// deposit and refund amounts have no producer yet, so their rows are simply absent
// until a caller can pass a real value.
//
// Precision is part of the data: the fee is an estimate (the wallet fixes the final
// charge when signing, and a balance shift rebuilds), while a refreshed on-chain
// balance is exact at the moment it was read.

export type PresignCostRowId =
  | "fee"
  | "minimumUtxo"
  | "deposit"
  | "refund"
  | "balance"
  | "balanceAfterFee";

export type PresignCostPrecision = "estimated" | "exact";

export type PresignCostRow = {
  id: PresignCostRowId;
  lovelace: string;
  precision: PresignCostPrecision;
};

export type PresignCostInput = {
  estimatedFeeLovelace?: string | null;
  walletBalanceLovelace?: string | null;
  minimumUtxoLovelace?: string | null;
  depositLovelace?: string | null;
  refundLovelace?: string | null;
};

// On-chain amounts are integer lovelace strings. Anything else (empty, decimal,
// negative, garbage) means "no data", not zero.
function parseNonNegativeLovelace(value: string | null | undefined): bigint | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}

export function buildPresignCostRows(input: PresignCostInput): PresignCostRow[] {
  const rows: PresignCostRow[] = [];
  const fee = parseNonNegativeLovelace(input.estimatedFeeLovelace);
  const balance = parseNonNegativeLovelace(input.walletBalanceLovelace);
  const minimumUtxo = parseNonNegativeLovelace(input.minimumUtxoLovelace);
  const deposit = parseNonNegativeLovelace(input.depositLovelace);
  const refund = parseNonNegativeLovelace(input.refundLovelace);

  if (fee !== null) {
    rows.push({ id: "fee", lovelace: fee.toString(), precision: "estimated" });
  }
  if (minimumUtxo !== null) {
    rows.push({ id: "minimumUtxo", lovelace: minimumUtxo.toString(), precision: "exact" });
  }
  if (deposit !== null) {
    rows.push({ id: "deposit", lovelace: deposit.toString(), precision: "exact" });
  }
  if (refund !== null) {
    rows.push({ id: "refund", lovelace: refund.toString(), precision: "exact" });
  }
  if (balance !== null) {
    rows.push({ id: "balance", lovelace: balance.toString(), precision: "exact" });
    // A negative remainder is an insufficient-funds signal, and that state belongs to
    // the readiness blockers, not to a cost row that reads "-5 ADA left".
    if (fee !== null && balance >= fee) {
      rows.push({
        id: "balanceAfterFee",
        lovelace: (balance - fee).toString(),
        precision: "estimated"
      });
    }
  }
  return rows;
}
