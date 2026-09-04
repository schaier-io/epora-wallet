import type { PayeeScanResult } from "@/components/payee/collect-payee-streaming-payments";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsPayeePayeeScanMessages.json";

const i18n = createDefaultTranslator("ComponentsPayeePayeeScanMessages", defaultMessages);

/**
 * What the empty list actually means.
 *
 * Two outcomes, not five. Either the scan ran and found nothing addressed to the connected
 * wallet, or it could not read anything and therefore has no answer at all. The earlier copy
 * reported how many Epora wallets exist on the network and said the reader was in none of
 * them ("No scheduled payments to your wallet in the ${readable} wallets that could be
 * read"), which measures other people's wallets to describe an empty list of the reader's
 * own. The count is not the reader's business and answers a question nobody asked.
 *
 * The unreadable-scan line stays, minus the count: "we could not look" is genuinely different
 * from "nobody is paying you", and only one of them is worth chasing an invoice over.
 */
export function describeEmptyScan(scan: PayeeScanResult): string {
  if (scan.walletsScanned > 0 && scan.walletsUnreadable === scan.walletsScanned) {
    return i18n("chainDataCouldNotBeRead");
  }

  return scan.walletsUnreadable > 0
    ? i18n("noPaymentsWithUnreadableData")
    : i18n("noScheduledPayments");
}

/**
 * The caveat above a list that did have results. Absence of evidence is not evidence: a list
 * built from a partial read must say it is partial, or it reads as the complete picture.
 * Returns `null` when the scan was clean.
 */
export function describeIncompleteScan(scan: PayeeScanResult): string | null {
  if (scan.walletsUnreadable > 0 && scan.entriesSkipped > 0) {
    return i18n("incompleteWithChainAndEntries", { count: scan.entriesSkipped });
  }
  if (scan.walletsUnreadable > 0) {
    return i18n("incompleteWithChainData");
  }
  if (scan.entriesSkipped > 0) {
    return i18n("incompleteWithEntries", { count: scan.entriesSkipped });
  }
  return null;
}
