import type { Data } from "@meshsdk/common";
import type { Asset } from "@/lib/types/contracts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsValueData.json";

const i18n = createDefaultTranslator("LibContractsValueData", defaultMessages);

export type ValueEntry = {
  policyId: string;
  assetName: string;
  amount: bigint;
};

export const POLICY_ID_BYTES = 28;
export const MAX_ASSET_NAME_BYTES = 32;
export const POLICY_ID_HEX_LENGTH = POLICY_ID_BYTES * 2;
export const MAX_ASSET_NAME_HEX_LENGTH = MAX_ASSET_NAME_BYTES * 2;

/** Ledger-valid ADA/native-asset identity. Native asset names may be empty. */
export function assertValidAssetIdParts(
  policyId: string,
  assetName: string,
  label = i18n("asset")
) {
  if (policyId.length === 0 && assetName.length === 0) {
    return;
  }
  if (!new RegExp(`^[0-9a-fA-F]{${POLICY_ID_HEX_LENGTH}}$`).test(policyId)) {
    throw new Error(i18n("invalidPolicyId", { label }));
  }
  if (
    assetName.length > MAX_ASSET_NAME_HEX_LENGTH ||
    assetName.length % 2 !== 0 ||
    !/^[0-9a-fA-F]*$/.test(assetName)
  ) {
    throw new Error(i18n("invalidAssetName", { label }));
  }
}

function readIntegerLike(value: unknown, label: string): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  throw new Error(i18n("mustBeWholeNumber", { label }));
}

function parseQuantityString(quantity: string, label: string): bigint {
  if (!/^\d+$/.test(quantity.trim())) {
    throw new Error(i18n("mustBeZeroOrMore", { label }));
  }

  return BigInt(quantity.trim());
}

function bigintToSafeInteger(value: bigint, label: string): number {
  const asNumber = Number(value);

  if (!Number.isSafeInteger(asNumber)) {
    throw new Error(i18n("outsideSupportedRange", { label }));
  }

  return asNumber;
}

function entryKey(policyId: string, assetName: string) {
  return `${policyId}\u0000${assetName}`;
}

// On-chain, each allowance/payout asset is the Aiken record
// `AssetEntry { policy_id, asset_name, quantity }`, which Plutus encodes as a
// constructor (`Constr 0 [ByteArray, ByteArray, Int]`), NOT a 3-element list.
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
    throw new Error(i18n("assetUnitNeedsPolicyId", { limit: POLICY_ID_HEX_LENGTH }));
  }

  const parts = {
    policyId: unit.slice(0, POLICY_ID_HEX_LENGTH),
    assetName: unit.slice(POLICY_ID_HEX_LENGTH)
  };
  assertValidAssetIdParts(parts.policyId, parts.assetName, i18n("assetUnit"));
  return {
    policyId: parts.policyId.toLowerCase(),
    assetName: parts.assetName.toLowerCase()
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
    assertValidAssetIdParts(entry.policyId, entry.assetName);
    const normalizedEntry = {
      ...entry,
      policyId: entry.policyId.toLowerCase(),
      assetName: entry.assetName.toLowerCase()
    };
    const key = entryKey(normalizedEntry.policyId, normalizedEntry.assetName);
    const current = totals.get(key);

    totals.set(
      key,
      current
        ? { ...current, amount: current.amount + normalizedEntry.amount }
        : normalizedEntry
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
  label = i18n("assetValue")
): Array<Data> {
  return serializeValueEntries(
    assets.map((asset, index) => {
      const { policyId, assetName } = splitAssetUnit(asset.unit);

      return {
        policyId,
        assetName,
        amount: parseQuantityString(
          asset.quantity,
          i18n("assetNumberAmount", { label, number: index + 1 })
        )
      };
    }),
    label
  );
}

export function parseValueData(value: unknown, label: string): ValueEntry[] {
  if (!Array.isArray(value)) {
    throw new Error(i18n("mustBeAssetList", { label }));
  }

  const entries = value.map((entry, index) => {
    if (!isAssetEntryConstr(entry)) {
      throw new Error(i18n("invalidAssetEntry", { label, number: index + 1 }));
    }

    const [policyId, assetName, amount] = entry.fields;

    if (typeof policyId !== "string") {
      throw new Error(i18n("invalidPolicyData", { label, number: index + 1 }));
    }

    if (typeof assetName !== "string") {
      throw new Error(i18n("invalidAssetNameData", { label, number: index + 1 }));
    }

    return {
      policyId,
      assetName,
      amount: readIntegerLike(
        amount,
        i18n("assetNumberAmount", { label, number: index + 1 })
      )
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
