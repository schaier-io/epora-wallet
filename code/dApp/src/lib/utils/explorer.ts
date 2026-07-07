// Canonical middle-truncation for on-chain identifiers (addresses, hashes,
// asset units). Every shortened identifier in the UI goes through here — do
// not hand-roll `slice(0, n)...slice(-m)` variants in components.
export function shortenIdentifier(
  value: string | null | undefined,
  leading = 10,
  trailing = 8
): string {
  if (!value) return "-";
  if (value.length <= leading + trailing + 1) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

// Bech32 addresses get a little more leading context than hashes.
export function shortenAddress(value: string | null | undefined): string {
  return shortenIdentifier(value, 12, 8);
}
