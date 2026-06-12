import { isAsset } from "./guards";
import { type Asset } from "@/lib/types/contracts";
import { type UTxO } from "@meshsdk/core";

export function cloneAssets(assets: Asset[]) {
  return assets.map((asset) => ({ ...asset }));
}

export function getAssetQuantityByUnit(assets: Asset[], unit: string) {
  return assets.find((asset) => asset.unit === unit)?.quantity ?? "0";
}

export function mergeAmountLists(amounts: Asset[][]): Asset[] {
  const totals = new Map<string, bigint>();

  for (const amountList of amounts) {
    for (const asset of amountList) {
      const current = totals.get(asset.unit) ?? 0n;
      totals.set(asset.unit, current + BigInt(asset.quantity));
    }
  }

  return [...totals.entries()].map(([unit, quantity]) => ({
    unit,
    quantity: quantity.toString()
  }));
}

export function subtractAmountLists(total: Asset[], allocated: Asset[]): Asset[] {
  const allocatedTotals = new Map<string, bigint>();

  for (const asset of allocated) {
    const current = allocatedTotals.get(asset.unit) ?? 0n;
    allocatedTotals.set(asset.unit, current + BigInt(asset.quantity));
  }

  return total
    .map((asset) => {
      const remaining =
        BigInt(asset.quantity) - (allocatedTotals.get(asset.unit) ?? 0n);

      if (remaining <= 0n) {
        return null;
      }

      return {
        unit: asset.unit,
        quantity: remaining.toString()
      };
    })
    .filter((asset): asset is Asset => asset !== null);
}

export function collectAddressAssets(
  utxos: Array<{ output?: { address?: string; amount?: Asset[] } } | null | undefined>,
  address: string
) {
  return mergeAmountLists(
    utxos
      .filter((utxo) => utxo?.output?.address === address && Array.isArray(utxo.output.amount))
      .map((utxo) => (utxo?.output?.amount ?? []).filter(isAsset))
  );
}

export function collectUtxoAssets(utxos: UTxO[]) {
  return mergeAmountLists(utxos.map((utxo) => utxo.output.amount.filter(isAsset)));
}

export function countAddressUtxos(
  utxos: Array<{ output?: { address?: string } } | null | undefined>,
  address: string
) {
  return utxos.filter((utxo) => utxo?.output?.address === address).length;
}

export function utxoContainsAsset(
  utxo: { output?: { amount?: Asset[] } } | null | undefined,
  unit: string
) {
  return Boolean(utxo?.output?.amount?.some((asset) => asset.unit === unit));
}

export function countAssetUtxos(
  utxos: Array<{ output?: { amount?: Asset[] } } | null | undefined>,
  unit: string
) {
  return utxos.filter((utxo) => utxoContainsAsset(utxo, unit)).length;
}

export function compareAssetAmounts(before: Asset[], after: Asset[]) {
  const quantitiesByUnit = new Map<string, bigint>();

  before.forEach((asset) => {
    quantitiesByUnit.set(asset.unit, BigInt(asset.quantity));
  });

  const allUnits = new Set<string>([
    ...before.map((asset) => asset.unit),
    ...after.map((asset) => asset.unit)
  ]);

  let sawIncrease = false;
  let sawDecrease = false;

  allUnits.forEach((unit) => {
    const beforeQuantity = quantitiesByUnit.get(unit) ?? 0n;
    const afterQuantity = BigInt(after.find((asset) => asset.unit === unit)?.quantity ?? "0");

    if (afterQuantity > beforeQuantity) {
      sawIncrease = true;
    }

    if (afterQuantity < beforeQuantity) {
      sawDecrease = true;
    }
  });

  if (!sawIncrease && !sawDecrease) {
    return "equal";
  }

  if (sawIncrease && sawDecrease) {
    return "mixed";
  }

  return sawIncrease ? "increase" : "decrease";
}

export function calculateAssetDelta(before: Asset[], after: Asset[]) {
  const allUnits = new Set<string>([
    ...before.map((asset) => asset.unit),
    ...after.map((asset) => asset.unit)
  ]);

  return [...allUnits]
    .map((unit) => {
      const beforeQuantity = BigInt(before.find((asset) => asset.unit === unit)?.quantity ?? "0");
      const afterQuantity = BigInt(after.find((asset) => asset.unit === unit)?.quantity ?? "0");
      const delta = afterQuantity - beforeQuantity;

      return {
        unit,
        quantity: delta.toString()
      };
    })
    .filter((asset) => BigInt(asset.quantity) !== 0n)
    .sort((left, right) => {
      if (left.unit === "lovelace") return -1;
      if (right.unit === "lovelace") return 1;
      return left.unit.localeCompare(right.unit);
    });
}

