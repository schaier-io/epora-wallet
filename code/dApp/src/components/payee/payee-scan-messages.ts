import type { PayeeScanResult } from "@/components/payee/collect-payee-streaming-payments";

/**
 * What the empty list actually means.
 *
 * Two outcomes, not five. Either the scan ran and found nothing addressed to the connected
 * wallet, or it could not read anything and therefore has no answer at all. The earlier copy
 * reported how many Epora wallets exist on the network and said the reader was in none of
 * them ("No scheduled payments to your wallet in the 7 wallets that could be read"), which
 * measures other people's wallets to describe an empty list of the reader's own. The count is
 * not the reader's business and answers a question nobody asked.
 *
 * The unreadable-scan line stays, minus the count: "we could not look" is genuinely different
 * from "nobody is paying you", and only one of them is worth chasing an invoice over.
 */
export function describeEmptyScan(scan: PayeeScanResult): string {
  if (scan.walletsScanned > 0 && scan.walletsUnreadable === scan.walletsScanned) {
    return "The chain data could not be read, so this is not an answer about your payments. Try Refresh; if it keeps failing, the chain data may be out of date.";
  }

  const base = "No scheduled payments to this wallet yet. Anyone paying you sets the payout address, so a payment appears here once a sender schedules one to it.";

  return scan.walletsUnreadable > 0
    ? `${base} Some chain data could not be read, so a payment could be hiding there.`
    : base;
}

/**
 * The caveat above a list that did have results. Absence of evidence is not evidence: a list
 * built from a partial read must say it is partial, or it reads as the complete picture.
 * Returns `null` when the scan was clean.
 */
export function describeIncompleteScan(scan: PayeeScanResult): string | null {
  const parts: string[] = [];

  if (scan.walletsUnreadable > 0) {
    // No wallet counts here either, for the same reason as the empty state: "how many Epora
    // wallets exist" is not something this page has to publish. That a part of the read
    // failed is what makes the list below possibly incomplete, and that is the whole caveat.
    parts.push("some chain data could not be read");
  }
  if (scan.entriesSkipped > 0) {
    // Not "your payments". `entriesSkipped` counts two different things: an entry whose shape
    // would not parse at all, which cannot be attributed to anybody because the payee is read
    // out of that same entry, and one of THIS payee's entries whose fields would not read.
    // Calling the total "scheduled payments that did not match the expected format" claimed
    // every one of them was theirs. "Could not be read" is true of both.
    parts.push(
      `${scan.entriesSkipped} scheduled payment ${
        scan.entriesSkipped === 1 ? "entry" : "entries"
      } could not be read`
    );
  }

  if (parts.length === 0) {
    return null;
  }

  return `This list may be incomplete: ${parts.join(", and ")}.`;
}
