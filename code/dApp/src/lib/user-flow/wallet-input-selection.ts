import type { UTxO } from "@meshsdk/core";
import {
  calculateMinimumLovelaceForOutput,
  getLovelaceQuantity
} from "@/lib/mesh/transactions/internals/value";
import type { Asset, WalletInputRef } from "@/lib/types/contracts";
import {
  nativeAssetCount,
  readPositiveBigInt,
  serializeAssetTotals,
  toAssetTotals
} from "@/lib/user-flow/asset-quantities";

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
  return suggestWalletInputsForRequiredTotals(
    utxos,
    toAssetTotals([requestedAssets])
  );
}

function suggestWalletInputsForRequiredTotals(
  utxos: UTxO[],
  requiredTotals: Map<string, bigint>
): WalletInputRef[] {
  const remaining = new Map(requiredTotals);
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

/**
 * Input suggestion for a wallet spend.
 *
 * Select enough UTxOs to cover every requested asset and leave its exact
 * per-asset streaming reserve and minimum ADA for the continuing output.
 * Return no suggestion when the loaded inputs cannot fund that requirement.
 */
export function suggestLockedInputsForSpend(
  utxos: UTxO[],
  requestedAssets: Asset[],
  streamingReserve: Asset[] = [],
  continuingOutputAddress?: string
): WalletInputRef[] {
  const requestedTotals = toAssetTotals([requestedAssets]);
  if (requestedTotals.size === 0) {
    return [];
  }

  const reserveTotals = toAssetTotals([streamingReserve]);
  const requiredTotals = new Map(
    [...requestedTotals].map(([unit, quantity]) => [
      unit,
      quantity + (reserveTotals.get(unit) ?? 0n)
    ])
  );

  const selections = suggestWalletInputsForRequiredTotals(utxos, requiredTotals);
  if (selections.length === 0) return [];

  const selectedRefs = new Set(
    selections.map((ref) => `${ref.txHash}#${ref.outputIndex}`)
  );
  const selectedUtxos = utxos.filter((utxo) =>
    selectedRefs.has(`${utxo.input.txHash}#${utxo.input.outputIndex}`)
  );
  const extraUtxos = utxos.filter((utxo) =>
    !selectedRefs.has(`${utxo.input.txHash}#${utxo.input.outputIndex}`) &&
    getLovelaceQuantity(utxo.output.amount) > 0n
  ).sort((left, right) => {
    const nativeDifference = nativeAssetCount(left.output.amount) -
      nativeAssetCount(right.output.amount);
    if (nativeDifference !== 0) return nativeDifference;
    const difference = getLovelaceQuantity(left.output.amount) -
      getLovelaceQuantity(right.output.amount);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  });

  for (;;) {
    const remainder = toAssetTotals(selectedUtxos.map((utxo) => utxo.output.amount));
    for (const [unit, quantity] of requestedTotals) {
      remainder.set(unit, (remainder.get(unit) ?? 0n) - quantity);
    }
    const amount = serializeAssetTotals(remainder);
    if (amount.length === 0) return selections;
    const minimumLovelace = calculateMinimumLovelaceForOutput({
      address: continuingOutputAddress ?? selectedUtxos[0]!.output.address,
      amount
    });
    if (getLovelaceQuantity(amount) >= minimumLovelace) return selections;

    // Keep change above its ledger minimum without a funding-wallet top-up:
    // payout and allowance validators require the exact declared value delta.
    const extra = extraUtxos.shift();
    if (!extra) return [];
    selectedUtxos.push(extra);
    selections.push({ ...extra.input });
  }
}

export function maximumAdaSpendWithChange(
  utxos: UTxO[],
  requestedQuantity: bigint,
  continuingOutputAddress?: string
): bigint {
  const remainder = toAssetTotals(utxos.map((utxo) => utxo.output.amount));
  const available = remainder.get("lovelace") ?? 0n;
  const requested = requestedQuantity < available ? requestedQuantity : available;
  if (requested <= 0n) return 0n;
  remainder.set("lovelace", available - requested);
  const amount = serializeAssetTotals(remainder);
  if (amount.length === 0) return requested;

  const minimumLovelace = calculateMinimumLovelaceForOutput({
    address: continuingOutputAddress ?? utxos[0]!.output.address,
    amount
  });
  const spendable = available - minimumLovelace;
  if (spendable <= 0n) return 0n;
  return spendable < requested ? spendable : requested;
}
