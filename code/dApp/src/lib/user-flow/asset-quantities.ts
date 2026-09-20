import {
  assertNonNegativeUint64,
  isNonNegativeUint64Decimal,
  type OnChainInteger
} from "@/lib/contracts/on-chain-integer";
import type { Asset, PayoutTransfer } from "@/lib/types/contracts";

export function readPositiveBigInt(value: string) {
  const normalized = value.trim();
  if (!isNonNegativeUint64Decimal(normalized)) {
    return null;
  }

  return BigInt(normalized);
}

export function toOnChainInteger(value: bigint, label: string): OnChainInteger {
  assertNonNegativeUint64(value, label);
  const asNumber = Number(value);
  return Number.isSafeInteger(asNumber) ? asNumber : value;
}

export function toAssetTotals(amounts: Asset[][]) {
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

export function serializeAssetTotals(totals: Map<string, bigint>): Asset[] {
  return [...totals.entries()]
    .filter(([, quantity]) => quantity > 0n)
    .sort(([leftUnit], [rightUnit]) => {
      if (leftUnit === "lovelace") return -1;
      if (rightUnit === "lovelace") return 1;
      return leftUnit.localeCompare(rightUnit);
    })
    .map(([unit, quantity]) => ({ unit, quantity: quantity.toString() }));
}

export function nativeAssetCount(amount: Asset[]) {
  return amount.filter((asset) =>
    asset.unit !== "lovelace" && asset.unit !== "" && BigInt(asset.quantity) > 0n
  ).length;
}

function sumAssetsByUnit(amounts: Asset[][]): Asset[] {
  return serializeAssetTotals(toAssetTotals(amounts));
}

export function requestedTransferAssets(transfers: PayoutTransfer[]): Asset[] {
  return sumAssetsByUnit(transfers.map((transfer) => transfer.amount));
}
