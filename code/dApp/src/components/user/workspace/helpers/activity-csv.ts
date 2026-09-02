import { type WalletActivityEvent } from "@/components/user/workspace/types";
import { formatWalletTransactionTime, normalizeBlockTimeMs, approximateBlockTimeMsFromSlot } from "./formatters";

/**
 * One row per activity event, quoted so commas, quotes, and newlines in the copy
 * survive round-tripping through spreadsheet apps.
 */
function csvField(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * The Activity feed as a spreadsheet: when it happened (machine-readable UTC and the
 * localized local time side by side), what it was, the amount as the feed words it,
 * who acted, the fee the chain charged, and the hash to look it up with.
 */
export function buildActivityCsv(
  events: WalletActivityEvent[],
  formatDateUtc: (ms: number) => string = (ms) => new Date(ms).toISOString(),
  formatDateLocal: (ms: number) => string = (ms) => formatWalletTransactionTime(ms) ?? ""
): string {
  const headers = [
    "Date (UTC)",
    "Date (local)",
    "Type",
    "Title",
    "Amount",
    "Actor",
    "Fee (lovelace)",
    "Tx hash"
  ];

  const rows = events.map((event) => {
    // Freshly submitted transactions read back without a block time; the slot
    // approximates it the same way the feed's own relative label does.
    const blockTimeMs =
      normalizeBlockTimeMs(event.transaction.blockTime) ??
      approximateBlockTimeMsFromSlot(event.transaction.slot);
    return [
      blockTimeMs === null ? "" : formatDateUtc(blockTimeMs),
      blockTimeMs === null ? "" : formatDateLocal(blockTimeMs),
      event.label,
      event.title,
      event.amountSummary,
      event.actorDetail
        ? `${event.actorLabel} (${event.actorDetail})`
        : event.actorLabel,
      event.transaction.fees ?? "",
      event.transaction.hash ?? ""
    ]
      .map(csvField)
      .join(",");
  });

  return [headers.map(csvField).join(","), ...rows].join("\n");
}
