import type { Asset, ConstrData } from "@/lib/types/contracts";
import { isOnChainInteger } from "./on-chain-integer";
import { isConstrData, readStateSections } from "./state-layout";
import { assertValidAssetIdParts } from "./value-data";

function readStreamingAssets(stateDatum: ConstrData) {
  return readStateSections(stateDatum).streamingPayments.map((payment) => {
    if (
      !isConstrData(payment) || payment.alternative !== 0 || payment.fields.length !== 8 ||
      !isOnChainInteger(payment.fields[0]) || BigInt(payment.fields[0]) < 0n ||
      typeof payment.fields[3] !== "string" || typeof payment.fields[4] !== "string"
    ) {
      throw new Error("Streaming asset proof requires valid streaming-payment records.");
    }
    const policyId = payment.fields[3].toLowerCase();
    const assetName = payment.fields[4].toLowerCase();
    assertValidAssetIdParts(policyId, assetName, "Streaming asset proof");
    return { id: BigInt(payment.fields[0]), unit: policyId + assetName || "lovelace" };
  });
}

/** Every mint stream is fresh. Manage requires proof only for IDs absent from its input State. */
export function getFreshStreamingAssetUnits(
  outputStateDatum: ConstrData,
  inputStateDatum?: ConstrData
): string[] {
  const existingIds = new Set(inputStateDatum ? readStreamingAssets(inputStateDatum).map(({ id }) => id) : []);
  return [...new Set(readStreamingAssets(outputStateDatum)
    .filter(({ id }) => !existingIds.has(id))
    .map(({ unit }) => unit))];
}

/** Pass assets from consumed and reference inputs. Collateral alone is not proof. */
export function getMissingStreamingAssetUnits(
  requiredUnits: readonly string[],
  assets: readonly Asset[]
): string[] {
  const present = new Set<string>();
  for (const asset of assets) {
    if (typeof asset.quantity !== "string" || !/^\d+$/.test(asset.quantity)) {
      throw new Error("Streaming asset proof quantity must be a non-negative integer string.");
    }
    if (BigInt(asset.quantity) > 0n) present.add(asset.unit.toLowerCase());
  }
  return [...new Set(requiredUnits.map((unit) => unit.toLowerCase()))].filter((unit) => !present.has(unit));
}
