export function shortenIdentifier(
  value: string | null | undefined,
  leading = 10,
  trailing = 8
): string {
  if (!value) return "-";
  if (value.length <= leading + trailing + 1) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}
