import type { Data } from "@meshsdk/common";
import type { Asset } from "@/lib/types/contracts";

export type ValueEntry = {
  policyId: string;
  assetName: string;
  amount: bigint;
};

const POLICY_ID_HEX_LENGTH = 56;

function readIntegerLike(value: unknown, label: string): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  throw new Error(`${label} must be an integer.`);
}

function parseQuantityString(quantity: string, label: string): bigint {
  if (!/^\d+$/.test(quantity.trim())) {
    throw new Error(`${label} must be a non-negative integer string.`);
  }

  return BigInt(quantity.trim());
}

function bigintToSafeInteger(value: bigint, label: string): number {
  const asNumber = Number(value);

  if (!Number.isSafeInteger(asNumber)) {
    throw new Error(`${label} is outside the supported integer range.`);
  }

  return asNumber;
}

function entryKey(policyId: string, assetName: string) {
  return `${policyId}\u0000${assetName}`;
}

// On-chain, each allowance/payout asset is the Aiken record
// `AssetEntry { policy_id, asset_name, quantity }`, which Plutus encodes as a
// constructor (`Constr 0 [ByteArray, ByteArray, Int]`) — NOT a 3-element list.
// So both the redeemer encoder and the datum reader speak the Constr form.
function isAssetEntryConstr(
  value: unknown
): value is { alternative: number; fields: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "alternative" in value &&
    "fields" in value &&
    (value as { alternative: unknown }).alternative === 0 &&
    Array.isArray((value as { fields: unknown }).fields) &&
    (value as { fields: unknown[] }).fields.length === 3
  );
}

export function splitAssetUnit(unit: string) {
  if (unit === "" || unit === "lovelace") {
    return {
      policyId: "",
      assetName: ""
    };
  }

  if (unit.length < POLICY_ID_HEX_LENGTH) {
    throw new Error(
      `Asset unit "${unit}" must include a ${POLICY_ID_HEX_LENGTH}-character policy id.`
    );
  }

  return {
    policyId: unit.slice(0, POLICY_ID_HEX_LENGTH),
    assetName: unit.slice(POLICY_ID_HEX_LENGTH)
  };
}

export function partsToUnit(policyId: string, assetName: string) {
  return policyId.length === 0 && assetName.length === 0
    ? "lovelace"
    : `${policyId}${assetName}`;
}

function normalizeValueEntries(entries: ValueEntry[]): ValueEntry[] {
  const totals = new Map<string, ValueEntry>();

  for (const entry of entries) {
    const key = entryKey(entry.policyId, entry.assetName);
    const current = totals.get(key);

    totals.set(
      key,
      current
        ? { ...current, amount: current.amount + entry.amount }
        : { ...entry }
    );
  }

  return [...totals.values()]
    .filter((entry) => entry.amount !== 0n)
    .sort((left, right) => {
      if (left.policyId !== right.policyId) {
        return left.policyId.localeCompare(right.policyId);
      }

      return left.assetName.localeCompare(right.assetName);
    });
}

export function serializeValueEntries(
  entries: ValueEntry[],
  label: string
): Array<Data> {
  return normalizeValueEntries(entries).map((entry) => ({
    alternative: 0,
    fields: [
      entry.policyId,
      entry.assetName,
      bigintToSafeInteger(
        entry.amount,
        `${label} ${partsToUnit(entry.policyId, entry.assetName)}`
      )
    ]
  }));
}

export function serializeAssetsToValueData(
  assets: Asset[] = [],
  label = "Asset value"
): Array<Data> {
  return serializeValueEntries(
    assets.map((asset, index) => {
      const { policyId, assetName } = splitAssetUnit(asset.unit);

      return {
        policyId,
        assetName,
        amount: parseQuantityString(asset.quantity, `${label}[${index}] quantity`)
      };
    }),
    label
  );
}

export function parseValueData(value: unknown, label: string): ValueEntry[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a list of asset entries.`);
  }

  const entries = value.map((entry, index) => {
    if (!isAssetEntryConstr(entry)) {
      throw new Error(
        `${label}[${index}] must be an AssetEntry constructor with 3 fields.`
      );
    }

    const [policyId, assetName, amount] = entry.fields;

    if (typeof policyId !== "string") {
      throw new Error(`${label}[${index}] policy_id must be a byte-array string.`);
    }

    if (typeof assetName !== "string") {
      throw new Error(`${label}[${index}] asset_name must be a byte-array string.`);
    }

    return {
      policyId,
      assetName,
      amount: readIntegerLike(amount, `${label}[${index}] quantity`)
    };
  });

  return normalizeValueEntries(entries);
}

export function valueEntriesToAssets(entries: ValueEntry[]): Asset[] {
  return normalizeValueEntries(entries).map((entry) => ({
    unit: partsToUnit(entry.policyId, entry.assetName),
    quantity: entry.amount.toString()
  }));
}
