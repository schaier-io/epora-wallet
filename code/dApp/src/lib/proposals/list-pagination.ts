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

// Sort position of a row (matching the list ordering createdAt desc, id desc).
// `createdAt` is an ISO-8601 string so the cursor stays JSON-serializable; the
// DB caller converts it back to a Date.
export type ProposalPagePosition = { createdAt: string; id: string };
export type ProposalPageCursor = ProposalPagePosition & {
  segment: ProposalListSegment;
};

type SegmentRequest = {
  segment: ProposalListSegment;
  before?: ProposalPagePosition;
  take: number;
};

type PaginationOptions = {
  limit: number;
  cursor?: ProposalPageCursor;
};

// Cursors are opaque base64url JSON tokens. They are not signed, so a client
// can forge any segment or position; the store stays safe because every query
// a token feeds is already scoped to the caller's visible rows.
const CURSOR_TOKEN_KEYS = { segment: "s", createdAt: "t", id: "i" } as const;

export function encodeProposalCursor(cursor: ProposalPageCursor): string {
  return Buffer.from(
    JSON.stringify({
      [CURSOR_TOKEN_KEYS.segment]: cursor.segment,
      [CURSOR_TOKEN_KEYS.createdAt]: cursor.createdAt,
      [CURSOR_TOKEN_KEYS.id]: cursor.id
    })
  ).toString("base64url");
}

export function decodeProposalCursor(raw: string): ProposalPageCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    const segment = parsed[CURSOR_TOKEN_KEYS.segment];
    const createdAt = parsed[CURSOR_TOKEN_KEYS.createdAt];
    const id = parsed[CURSOR_TOKEN_KEYS.id];
    if (segment !== "active" && segment !== "terminal") return null;
    if (typeof id !== "string" || id.length === 0) return null;
    if (typeof createdAt !== "string") return null;
    const timestamp = Date.parse(createdAt);
    if (Number.isNaN(timestamp)) return null;
    return {
      segment,
      createdAt: new Date(timestamp).toISOString(),
      id
    };
  } catch {
    return null;
  }
}

function cursorPosition(
  segment: ProposalListSegment,
  row: { id: string; createdAt: Date | string }
): ProposalPageCursor {
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
  return { segment, createdAt, id: row.id };
}

/**
 * Fill one page from active proposals first, then terminal history. The caller
 * owns persistence details; this helper owns the cross-segment cursor rules.
 *
 * Cursors capture the segment and sort position current when the page was
 * served, not the cursor row's live status: a proposal that changes status
 * between page requests must not move the remaining rows out from under the
 * cursor. Positioning is therefore pure keyset (createdAt, id) and works even
 * when the cursor row itself no longer matches the segment filter.
 */
export async function paginateProposalRows<
  T extends { id: string; createdAt: Date | string }
>(
  options: PaginationOptions,
  loadSegment: (request: SegmentRequest) => Promise<T[]>
): Promise<{ rows: T[]; nextCursor: ProposalPageCursor | null }> {
  const { limit, cursor } = options;
  // Mirrors the pre-keyset contract: a non-positive limit yields a clean empty
  // page instead of an underflow in the take/remaining arithmetic below.
  if (limit <= 0) {
    return { rows: [], nextCursor: null };
  }
  if (cursor?.segment === "terminal") {
    const rows = await loadSegment({
      segment: "terminal",
      before: cursor,
      take: limit + 1
    });
    const page = rows.slice(0, limit);
    return {
      rows: page,
      nextCursor:
        rows.length > limit ? cursorPosition("terminal", page[page.length - 1]) : null
    };
  }

  const activeRows = await loadSegment({
    segment: "active",
    before: cursor?.segment === "active" ? cursor : undefined,
    take: limit + 1
  });
  if (activeRows.length > limit) {
    const page = activeRows.slice(0, limit);
    return {
      rows: page,
      nextCursor: cursorPosition("active", page[page.length - 1])
    };
  }

  const remaining = limit - activeRows.length;
  const terminalRows = await loadSegment({ segment: "terminal", take: remaining + 1 });
  const terminalPage = terminalRows.slice(0, remaining);
  const rows = [...activeRows, ...terminalPage];
  const hasMore = terminalRows.length > remaining;
  let nextCursor: ProposalPageCursor | null = null;
  if (hasMore) {
    // The page can end inside terminal history, or exactly fill up on the last
    // active row while older terminal history waits. Those need different
    // segments: terminal rows may be newer than the last active row, so the
    // active row's position must never be read as a terminal position.
    nextCursor =
      remaining > 0
        ? cursorPosition("terminal", rows[rows.length - 1])
        : cursorPosition("active", activeRows[activeRows.length - 1]);
  }
  return { rows, nextCursor };
}
