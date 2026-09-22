import type { ProposalSummary } from "@/lib/proposals/types";

/**
 * The proposer's own label/value pairs for a request: the amount, the destination address,
 * whatever the builder recorded.
 *
 * Shared because the two places that render them had drifted apart, and the drift was in the
 * direction `proposal-detail.tsx` had already been fixed away from. The signer's copy used a
 * grid; the proposer's copy in `create-proposal-panel.tsx` still used
 * `flex justify-between` with `text-right` and `gap-1`, which are the two shapes the detail
 * panel's comments call out by name:
 *
 * - Grid, not `justify-between`. The value belongs next to its label. Pushed to the far end,
 *   a truncated bech32 address welded itself to the next row's label, which is the one
 *   string a co-signer compares before signing.
 * - `gap-y-3`, not `gap-y-1`. At 4px the space between a value and the next pair's label was
 *   smaller than the word spaces inside the value, so the summary read as one run-on string.
 *
 * One definition, so the proposer and the signer read the same transaction the same way.
 */
export function ProposalSummaryRows({ rows }: { rows: ProposalSummary["rows"] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="grid min-w-0 grid-cols-[auto_1fr] gap-x-3">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 wrap-anywhere">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
