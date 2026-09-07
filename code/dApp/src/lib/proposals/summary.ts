import type { ProposalSummary } from "@/lib/proposals/types";
import {
  MAX_SUMMARY_BYTES,
  MAX_SUMMARY_CELL_LENGTH,
  MAX_SUMMARY_HEADLINE_LENGTH,
  MAX_SUMMARY_ROWS,
  utf8ByteLength
} from "@/lib/proposals/limits";

export function fitProposalSummaryForStorage(summary: ProposalSummary): ProposalSummary {
  const fitted: ProposalSummary = {
    headline: summary.headline.slice(0, MAX_SUMMARY_HEADLINE_LENGTH),
    rows: []
  };

  for (const row of summary.rows.slice(0, MAX_SUMMARY_ROWS)) {
    const nextRow = {
      label: row.label.slice(0, MAX_SUMMARY_CELL_LENGTH),
      value: row.value.slice(0, MAX_SUMMARY_CELL_LENGTH)
    };
    const next = { ...fitted, rows: [...fitted.rows, nextRow] };
    if (utf8ByteLength(JSON.stringify(next)) > MAX_SUMMARY_BYTES) {
      break;
    }
    fitted.rows.push(nextRow);
  }

  return fitted;
}
