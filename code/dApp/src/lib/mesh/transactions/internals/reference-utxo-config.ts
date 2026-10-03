/** Parse a reference locator without loading transaction serialization code. */
export function parseReferenceUtxoConfig(value: string | undefined, label: string) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^([0-9a-f]{64})(?:#|:)(\d+)$/i);
  if (!match) {
    throw new Error(`${label} must use the format txHash#index.`);
  }

  return {
    txHash: match[1]!.toLowerCase(),
    outputIndex: Number(match[2])
  };
}
