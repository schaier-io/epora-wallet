import type { ProposalStatus } from "./types";

export type ProposalListSegment = "active" | "terminal";

export const ACTIVE_PROPOSAL_STATUSES = [
  "OPEN",
  "SUBMITTING"
] as const satisfies readonly ProposalStatus[];
export const TERMINAL_PROPOSAL_STATUSES = [
  "SUBMITTED",
  "CANCELLED"
] as const satisfies readonly ProposalStatus[];

export function proposalListSegment(status: string): ProposalListSegment {
  return (ACTIVE_PROPOSAL_STATUSES as readonly string[]).includes(status)
    ? "active"
    : "terminal";
}

type SegmentRequest = {
  segment: ProposalListSegment;
  cursorId?: string;
  take: number;
};

type PaginationOptions = {
  limit: number;
  cursorId?: string;
  cursorSegment?: ProposalListSegment;
};

/**
 * Fill one page from active proposals first, then terminal history. The caller
 * owns persistence details; this helper owns the cross-segment cursor rules.
 */
export async function paginateProposalRows<T extends { id: string }>(
  options: PaginationOptions,
  loadSegment: (request: SegmentRequest) => Promise<T[]>
): Promise<{ rows: T[]; nextCursor: string | null }> {
  if (options.cursorId && options.cursorSegment === "terminal") {
    const rows = await loadSegment({
      segment: "terminal",
      cursorId: options.cursorId,
      take: options.limit + 1
    });
    const page = rows.slice(0, options.limit);
    return {
      rows: page,
      nextCursor: rows.length > options.limit ? (page.at(-1)?.id ?? null) : null
    };
  }

  const activeRows = await loadSegment({
    segment: "active",
    cursorId: options.cursorId,
    take: options.limit + 1
  });
  if (activeRows.length > options.limit) {
    const page = activeRows.slice(0, options.limit);
    return { rows: page, nextCursor: page.at(-1)?.id ?? null };
  }

  const remaining = options.limit - activeRows.length;
  const terminalRows = await loadSegment({ segment: "terminal", take: remaining + 1 });
  const terminalPage = terminalRows.slice(0, remaining);
  const rows = [...activeRows, ...terminalPage];
  const hasMore = terminalRows.length > remaining;
  return {
    rows,
    nextCursor: hasMore ? (rows.at(-1)?.id ?? null) : null
  };
}
