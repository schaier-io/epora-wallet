import type { PayeeScanResult } from "@/components/payee/collect-payee-streaming-payments";

/**
 * What the empty list actually means.
 *
 * A single line ("No receiver-owned scheduled payments were found for your wallet.") stood for
 * every outcome: no Epora wallets on the network at all, wallets whose datum would not parse,
 * malformed entries, and the honest case of having none. A contractor cannot act on that.
 * "Nobody is paying you" and "we could not read the wallets that might be" call for opposite
 * responses, and only one of them is worth chasing an invoice over.
 */
export function describeEmptyScan(scan: PayeeScanResult): string {
  if (scan.walletsScanned === 0) {
    return "No Epora wallets were found on this network, so there is nothing to check yet. If you were expecting a payment, the sender may not have created their wallet.";
  }

  if (scan.walletsUnreadable === scan.walletsScanned) {
    return `None of the ${scan.walletsScanned} Epora wallets on this network could be read, so this is not an answer about your payments. Try Refresh; if it keeps failing, the chain data may be out of date.`;
  }

  const readable = scan.walletsScanned - scan.walletsUnreadable;
  const base = `No scheduled payments to your wallet in the ${readable} ${
    readable === 1 ? "wallet" : "wallets"
  } that could be read.`;

  return scan.walletsUnreadable > 0
    ? `${base} ${describeUnreadable(scan.walletsUnreadable)}, so a payment could be hiding there.`
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
    parts.push(`${describeUnreadable(scan.walletsUnreadable)} of ${scan.walletsScanned}`);
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

function describeUnreadable(count: number): string {
  return `${count} ${count === 1 ? "wallet" : "wallets"} could not be read`;
}
