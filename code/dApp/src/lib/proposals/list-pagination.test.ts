import assert from "node:assert/strict";
import test from "node:test";
import {
  paginateProposalRows,
  proposalListSegment,
  type ProposalListSegment
} from "./list-pagination";
import type { ProposalStatus } from "./types";

type Row = { id: string; status: ProposalStatus };

function segmentLoader(rows: Row[]) {
  return async (request: {
    segment: ProposalListSegment;
    cursorId?: string;
    take: number;
  }): Promise<Row[]> => {
    const segmentRows = rows.filter(
      (row) => proposalListSegment(row.status) === request.segment
    );
    const start = request.cursorId
      ? segmentRows.findIndex((row) => row.id === request.cursorId) + 1
      : 0;
    return segmentRows.slice(start, start + request.take);
  };
}

test("mixed proposal pages put active work before terminal history", async () => {
  const open2 = { id: "open-2", status: "OPEN" } as const;
  const open1 = { id: "open-1", status: "SUBMITTING" } as const;
  const cancelled2 = { id: "cancelled-2", status: "CANCELLED" } as const;
  const cancelled1 = { id: "cancelled-1", status: "SUBMITTED" } as const;
  const load = segmentLoader([cancelled2, open2, cancelled1, open1]);

  const first = await paginateProposalRows({ limit: 3 }, load);
  assert.deepEqual(first, {
    rows: [open2, open1, cancelled2],
    nextCursor: "cancelled-2"
  });

  const second = await paginateProposalRows(
    { limit: 3, cursorId: first.nextCursor!, cursorSegment: "terminal" },
    load
  );
  assert.deepEqual(second, {
    rows: [cancelled1],
    nextCursor: null
  });
});

test("a full active page continues into terminal history through the same cursor", async () => {
  const open2 = { id: "open-2", status: "OPEN" } as const;
  const open1 = { id: "open-1", status: "OPEN" } as const;
  const submitted = { id: "submitted-1", status: "SUBMITTED" } as const;
  const load = segmentLoader([open2, open1, submitted]);

  const first = await paginateProposalRows({ limit: 2 }, load);
  assert.deepEqual(first, {
    rows: [open2, open1],
    nextCursor: "open-1"
  });

  const second = await paginateProposalRows(
    { limit: 2, cursorId: first.nextCursor!, cursorSegment: "active" },
    load
  );
  assert.deepEqual(second, {
    rows: [submitted],
    nextCursor: null
  });
});

test("proposal lifecycle statuses map to the correct list segment", () => {
  assert.equal(proposalListSegment("OPEN"), "active");
  assert.equal(proposalListSegment("SUBMITTING"), "active");
  assert.equal(proposalListSegment("SUBMITTED"), "terminal");
  assert.equal(proposalListSegment("CANCELLED"), "terminal");
});
