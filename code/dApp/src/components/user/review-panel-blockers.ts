import type { FieldErrors, ReadinessIssue } from "@/components/user/flow-types";
import { flattenFieldErrors } from "@/components/user/review-panel-parts";

// Pure extraction of the review panel's blocker selection: one primary blocker up
// front, the rest collapsed into a deduplicated list, and field errors hidden when a
// readiness issue already tells the same story (same label). Keeping it out of the
// component makes the grouping and dedup rules testable on their own.

export type BlockerSummary = {
  primary: ReadinessIssue | null;
  additional: ReadinessIssue[];
  fieldErrors: Array<{ key: string; message: string }>;
};

function blockerKey(issue: ReadinessIssue) {
  return `${issue.label.trim().toLowerCase()}\u0000${issue.description.trim().toLowerCase()}`;
}

export function summarizeBlockers(
  issues: ReadinessIssue[],
  fieldErrors: FieldErrors
): BlockerSummary {
  const blockingIssues = issues.filter((issue) => issue.blocking);
  const primary = blockingIssues[0] ?? null;
  // The same condition can arrive twice (a prerequisite plus a field error that names
  // it), and the collapsed "Show all issues" list must not say it two times.
  const seen = new Set<string>(primary ? [blockerKey(primary)] : []);
  const additional = blockingIssues.slice(1).filter((issue) => {
    const key = blockerKey(issue);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const flattened = flattenFieldErrors(fieldErrors);
  const blockingLabels = new Set(
    blockingIssues
      .map((issue) => (typeof issue.label === "string" ? issue.label.trim().toLowerCase() : ""))
      .filter((value) => value.length > 0)
  );
  return {
    primary,
    additional,
    // Only when a primary blocker exists, exactly as the panel behaved before: with
    // nothing else blocking, the field errors box is the one place the problems show.
    fieldErrors: primary
      ? flattened.filter((entry) => !blockingLabels.has(entry.key.trim().toLowerCase()))
      : flattened
  };
}
