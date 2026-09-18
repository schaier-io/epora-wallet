import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeProposalCursor,
  encodeProposalCursor,
  paginateProposalRows,
  proposalListSegment,
  type ProposalListSegment,
  type ProposalPageCursor
} from "./list-pagination";
import type { ProposalStatus } from "./types";

type Row = { id: string; createdAt: string; status: ProposalStatus };

// Fixture arrays are pre-sorted in list order (createdAt desc, id desc), the
// order the database returns. The loader applies the same two filters as the
// store: segment status membership and strict keyset positioning after `before`.
function segmentLoader(rows: Row[]) {
  return async (request: {
    segment: ProposalListSegment;
    before?: { createdAt: string; id: string };
    take: number;
  }): Promise<Row[]> => {
    const inSegment = rows.filter(
      (row) => proposalListSegment(row.status) === request.segment
    );
    const positioned = request.before
      ? inSegment.filter(
          (row) =>
            row.createdAt < request.before!.createdAt ||
            (row.createdAt === request.before!.createdAt &&
              row.id < request.before!.id)
        )
      : inSegment;
    return positioned.slice(0, request.take);
  };
}

test("mixed proposal pages put active work before terminal history", async () => {
  const open2: Row = { id: "open-2", createdAt: "2026-01-04T00:00:00.000Z", status: "OPEN" };
  const open1: Row = { id: "open-1", createdAt: "2026-01-03T00:00:00.000Z", status: "SUBMITTING" };
  const cancelled2: Row = { id: "cancelled-2", createdAt: "2026-01-02T00:00:00.000Z", status: "CANCELLED" };
  const cancelled1: Row = { id: "cancelled-1", createdAt: "2026-01-01T00:00:00.000Z", status: "SUBMITTED" };
  const load = segmentLoader([open2, open1, cancelled2, cancelled1]);

  const first = await paginateProposalRows({ limit: 3 }, load);
  assert.deepEqual(first.rows.map((row) => row.id), ["open-2", "open-1", "cancelled-2"]);
  assert.deepEqual(first.nextCursor, {
    segment: "terminal",
    createdAt: "2026-01-02T00:00:00.000Z",
    id: "cancelled-2"
  });

  const second = await paginateProposalRows(
    { limit: 3, cursor: first.nextCursor! },
    load
  );
  assert.deepEqual(second.rows.map((row) => row.id), ["cancelled-1"]);
  assert.equal(second.nextCursor, null);
});

test("a full active page continues into terminal history through the same cursor", async () => {
  const open2: Row = { id: "open-2", createdAt: "2026-01-03T00:00:00.000Z", status: "OPEN" };
  const open1: Row = { id: "open-1", createdAt: "2026-01-02T00:00:00.000Z", status: "OPEN" };
  const submitted: Row = { id: "submitted-1", createdAt: "2026-01-01T00:00:00.000Z", status: "SUBMITTED" };
  const load = segmentLoader([open2, open1, submitted]);

  const first = await paginateProposalRows({ limit: 2 }, load);
  assert.deepEqual(first.rows.map((row) => row.id), ["open-2", "open-1"]);
  // The page filled up on the last active row while terminal history waits, so
  // the cursor must stay in the active segment: terminal rows can be newer than
  // the last active row and must not be skipped by an active-segment position.
  assert.deepEqual(first.nextCursor, {
    segment: "active",
    createdAt: "2026-01-02T00:00:00.000Z",
    id: "open-1"
  });

  const second = await paginateProposalRows(
    { limit: 2, cursor: first.nextCursor! },
    load
  );
  assert.deepEqual(second.rows.map((row) => row.id), ["submitted-1"]);
  assert.equal(second.nextCursor, null);
});

test("cursor proposal changing status between pages still serves remaining open requests", async () => {
  const a: Row = { id: "a", createdAt: "2026-01-03T00:00:00.000Z", status: "OPEN" };
  const b: Row = { id: "b", createdAt: "2026-01-02T00:00:00.000Z", status: "OPEN" };
  const c: Row = { id: "c", createdAt: "2026-01-01T00:00:00.000Z", status: "OPEN" };
  const rows = [a, b, c];
  const load = segmentLoader(rows);

  const first = await paginateProposalRows({ limit: 2 }, load);
  assert.deepEqual(first.rows.map((row) => row.id), ["a", "b"]);
  assert.equal(first.nextCursor?.segment, "active");
  assert.equal(first.nextCursor?.id, "b");

  // Regression for issue #401: the cursor proposal is submitted (or cancelled)
  // while the client holds its cursor. The next page must still reach the
  // remaining open request (c) and then the terminal history (b itself).
  b.status = "SUBMITTED";

  const second = await paginateProposalRows(
    { limit: 2, cursor: first.nextCursor! },
    load
  );
  assert.deepEqual(second.rows.map((row) => row.id), ["c", "b"]);
  assert.equal(second.nextCursor, null);

  // Same mutation to a cancelled state must behave identically.
  b.status = "OPEN";
  const firstCancelled = await paginateProposalRows({ limit: 2 }, load);
  assert.deepEqual(firstCancelled.rows.map((row) => row.id), ["a", "b"]);
  b.status = "CANCELLED";
  const secondCancelled = await paginateProposalRows(
    { limit: 2, cursor: firstCancelled.nextCursor! },
    load
  );
  assert.deepEqual(secondCancelled.rows.map((row) => row.id), ["c", "b"]);
});

test("terminal cursor continues terminal history without repeating active rows", async () => {
  const open: Row = { id: "open", createdAt: "2026-01-03T00:00:00.000Z", status: "OPEN" };
  const submitted2: Row = { id: "submitted-2", createdAt: "2026-01-02T00:00:00.000Z", status: "SUBMITTED" };
  const submitted1: Row = { id: "submitted-1", createdAt: "2026-01-01T00:00:00.000Z", status: "SUBMITTED" };
  const load = segmentLoader([open, submitted2, submitted1]);

  const first = await paginateProposalRows({ limit: 1 }, load);
  assert.deepEqual(first.rows.map((row) => row.id), ["open"]);
  assert.equal(first.nextCursor?.segment, "active");

  const second = await paginateProposalRows(
    { limit: 1, cursor: first.nextCursor! },
    load
  );
  assert.deepEqual(second.rows.map((row) => row.id), ["submitted-2"]);
  assert.equal(second.nextCursor?.segment, "terminal");

  const third = await paginateProposalRows(
    { limit: 1, cursor: second.nextCursor! },
    load
  );
  assert.deepEqual(third.rows.map((row) => row.id), ["submitted-1"]);
  assert.equal(third.nextCursor, null);
});

test("cursor tokens survive the encode/decode round trip the store performs", async () => {
  const cursor: ProposalPageCursor = {
    segment: "terminal",
    createdAt: "2026-01-02T03:04:05.678Z",
    id: "ckfaq10x2001efghijklm12ab"
  };
  const decoded = decodeProposalCursor(encodeProposalCursor(cursor));
  assert.deepEqual(decoded, cursor);

  // A page fetched through the token must equal one fetched with the object.
  const rows: Row[] = [
    { id: "a", createdAt: "2026-01-03T00:00:00.000Z", status: "OPEN" },
    { id: "b", createdAt: "2026-01-02T00:00:00.000Z", status: "SUBMITTED" }
  ];
  const load = segmentLoader(rows);
  const first = await paginateProposalRows({ limit: 1 }, load);
  assert.ok(first.nextCursor);
  const viaToken = await paginateProposalRows(
    { limit: 1, cursor: decodeProposalCursor(encodeProposalCursor(first.nextCursor))! },
    load
  );
  const direct = await paginateProposalRows(
    { limit: 1, cursor: first.nextCursor },
    load
  );
  assert.deepEqual(viaToken, direct);
});

test("malformed or legacy bare-id cursors decode to null", () => {
  assert.equal(decodeProposalCursor("ckfaq10x2001efghijklm12ab"), null);
  assert.equal(decodeProposalCursor(""), null);
  assert.equal(decodeProposalCursor(encodeProposalCursor({
    segment: "active",
    createdAt: "2026-01-02T03:04:05.678Z",
    id: "x"
  }).slice(0, -4)), null);
  assert.equal(
    decodeProposalCursor(
      Buffer.from(JSON.stringify({ s: " sideways ", t: "2026-01-02T03:04:05.678Z", i: "x" })).toString("base64url")
    ),
    null
  );
  assert.equal(
    decodeProposalCursor(
      Buffer.from(JSON.stringify({ s: "active", t: "not-a-date", i: "x" })).toString("base64url")
    ),
    null
  );
  assert.equal(
    decodeProposalCursor(
      Buffer.from(JSON.stringify({ s: "active", t: "2026-01-02T03:04:05.678Z" })).toString("base64url")
    ),
    null
  );
});

test("a non-positive limit yields a clean empty page like the pre-keyset contract", async () => {
  const open: Row = { id: "open", createdAt: "2026-01-03T00:00:00.000Z", status: "OPEN" };
  let loadCalls = 0;
  const load = async () => {
    loadCalls += 1;
    return [open];
  };

  const page = await paginateProposalRows({ limit: 0 }, load);
  assert.deepEqual(page.rows, []);
  assert.equal(page.nextCursor, null);
  const withCursor = await paginateProposalRows(
    { limit: -1, cursor: { segment: "terminal", createdAt: "2026-01-01T00:00:00.000Z", id: "x" } },
    load
  );
  assert.deepEqual(withCursor.rows, []);
  assert.equal(withCursor.nextCursor, null);
  assert.equal(loadCalls, 0);
});

test("proposal lifecycle statuses map to the correct list segment", () => {
  assert.equal(proposalListSegment("OPEN"), "active");
  assert.equal(proposalListSegment("SUBMITTING"), "active");
  assert.equal(proposalListSegment("SUBMITTED"), "terminal");
  assert.equal(proposalListSegment("CANCELLED"), "terminal");
});
