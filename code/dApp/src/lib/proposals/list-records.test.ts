import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Prisma, PrismaClient } from "@/generated/prisma";
import { STT_CACHE_NETWORK } from "@/lib/stt-cache/domain";
import { getPrisma } from "@/lib/prisma";
import { decodeProposalCursor, encodeProposalCursor } from "./list-pagination";
import { listProposalRecordsForParticipant } from "./list-records";

const DB_SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL not set; run via `pnpm test`";

// Regression tests for the DB half of the proposal list pagination (issue #401):
// token decode, the keysetAfter where-composition, the legacy bare-id fallback,
// and the visibility scoping that keeps a cursor inside the caller's rows.
// list-pagination.test.ts pins the pure cross-segment rules; these pin what the
// store asks Postgres to do.

// Fixed epoch so createdAt values (and the id tie-break tests) are deterministic
// across runs; rows are seeded with explicit ids whose lexical order matches the
// intended (createdAt desc, id desc) order.
const T0 = Date.parse("2026-01-01T00:00:00.000Z");

type ProposalSeed = {
  id: string;
  createdAt: Date;
  creator: string;
  walletUnit: string;
  status?: string;
};

function proposalRow(spec: ProposalSeed): Prisma.MultiSigProposalCreateInput {
  return {
    id: spec.id,
    network: STT_CACHE_NETWORK,
    walletUnit: spec.walletUnit,
    walletPolicyId: `policy-${spec.id}`,
    title: `Proposal ${spec.id}`,
    actionKind: "use",
    authorityPath: "multisig",
    builder: "use",
    buildContextJson: "{}",
    unsignedTxHex: "80",
    txBodyHash: `hash-${spec.id}`,
    status: spec.status ?? "OPEN",
    createdByKeyHash: spec.creator,
    createdAt: spec.createdAt
  };
}

async function seedProposal(db: PrismaClient, spec: ProposalSeed) {
  return db.multiSigProposal.create({ data: proposalRow(spec) });
}

// Membership fixtures only matter for the visibility test; every other test
// relies on the proposer fallback (rows the caller created are always visible).
async function seedWalletWithParticipants(
  db: PrismaClient,
  unit: string,
  participantKeyHashes: string[]
): Promise<void> {
  const wallet = await db.sttWallet.create({
    data: {
      network: STT_CACHE_NETWORK,
      policyId: unit.slice(0, 8),
      assetNameHex: unit.slice(8),
      unit,
      sttScriptAddress: `stt_${unit}`,
      walletScriptAddress: `wallet_${unit}`
    }
  });
  await db.sttParticipant.createMany({
    data: participantKeyHashes.map((paymentKeyHash, index) => ({
      walletId: wallet.id,
      role: "signer",
      participantKey: `${unit}-${index}`,
      paymentKeyHash
    }))
  });
}

// Run-unique keys/units, so cleanup removes exactly what one test created and
// leftovers from earlier runs can never match a caller's visibility scope.
function cleanup(creators: string[], units: string[] = []) {
  const db = getPrisma();
  return async () => {
    await db.multiSigProposal.deleteMany({ where: { createdByKeyHash: { in: creators } } });
    await db.sttParticipant.deleteMany({ where: { paymentKeyHash: { in: creators } } });
    if (units.length > 0) {
      await db.sttWallet.deleteMany({ where: { unit: { in: units } } });
    }
  };
}

const list = (
  creator: string,
  options: { limit: number; cursor?: string },
  walletUnit?: string
) => listProposalRecordsForParticipant(getPrisma(), creator, walletUnit, options);

test("a status flip on the cursor row cannot skip the remaining open requests (issue #401)", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  const run = randomUUID().slice(0, 8);
  const unit = `${run}-unit`;
  t.after(() => cleanup([creator]));

  // Newest to oldest: p1, p2, p3, p4.
  for (const [index, id] of ["p1", "p2", "p3", "p4"].entries()) {
    await seedProposal(db, {
      id: `${run}-${id}`,
      createdAt: new Date(T0 + (4 - index) * 1000),
      creator,
      walletUnit: unit
    });
  }

  const page1 = await list(creator, { limit: 2 });
  assert.deepEqual(
    page1.proposals.map((p) => p.id),
    [`${run}-p1`, `${run}-p2`]
  );
  // Page 1 ends on an opaque token capturing the active segment and position.
  const token = decodeProposalCursor(page1.nextCursor ?? "");
  assert.ok(token, "page 1 must end on a decodeable cursor token");
  assert.equal(token.segment, "active");
  assert.equal(token.id, `${run}-p2`);
  assert.equal(token.createdAt, new Date(T0 + 3000).toISOString());

  // Between requests the cursor row itself leaves the active segment.
  await db.multiSigProposal.update({
    where: { id: `${run}-p2` },
    data: { status: "CANCELLED" }
  });

  // Page 2 still serves the remaining open requests first, then reaches the
  // flipped cursor row as terminal history. A live-status-derived segment here
  // would jump straight to terminal and skip p3/p4.
  const page2 = await list(creator, { limit: 3, cursor: page1.nextCursor ?? "" });
  assert.deepEqual(
    page2.proposals.map((p) => [p.id, p.status]),
    [
      [`${run}-p3`, "OPEN"],
      [`${run}-p4`, "OPEN"],
      [`${run}-p2`, "CANCELLED"]
    ]
  );
  assert.equal(page2.nextCursor, null);
});

test("a cursor token or bare id cannot surface another wallet's rows", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const alice = randomUUID();
  const bob = randomUUID();
  const run = randomUUID().slice(0, 8);
  const unitB = `unit-${randomUUID()}`;
  t.after(() => cleanup([alice, bob], [unitB]));

  await seedWalletWithParticipants(db, unitB, [bob]);
  // Bob's proposals in his wallet; the newer one is the position a forged
  // token (or his own bare-id cursor) can aim at.
  await seedProposal(db, {
    id: `${run}-bob1`,
    createdAt: new Date(T0 + 2000),
    creator: bob,
    walletUnit: unitB
  });
  await seedProposal(db, {
    id: `${run}-bob2`,
    createdAt: new Date(T0 + 1500),
    creator: bob,
    walletUnit: unitB
  });
  // Alice's own proposal, older than Bob's; visible via the proposer fallback.
  await seedProposal(db, {
    id: `${run}-alice`,
    createdAt: new Date(T0 + 1000),
    creator: alice,
    walletUnit: `unit-${randomUUID()}`
  });

  // A forged token positioned exactly on Bob's row stays inside Alice's
  // visible set: it may position her page, never widen it.
  const forged = encodeProposalCursor({
    segment: "active",
    createdAt: new Date(T0 + 2000).toISOString(),
    id: `${run}-bob1`
  });
  const page = await list(alice, { limit: 10, cursor: forged });
  assert.deepEqual(
    page.proposals.map((p) => p.id),
    [`${run}-alice`]
  );

  // A bare foreign id resolves only inside the caller's visible set, so it
  // cannot act as a cross-wallet cursor oracle either.
  const foreign = await list(alice, { limit: 10, cursor: `${run}-bob1` });
  assert.deepEqual(foreign, { proposals: [], nextCursor: null });
  const unknown = await list(alice, { limit: 10, cursor: "no-such-proposal" });
  assert.deepEqual(unknown, { proposals: [], nextCursor: null });

  // The same bare id works for its owner (a cursor positions strictly after
  // the row, so bob1's page holds his older request), proving the empty pages
  // above are scoping, not id handling.
  const own = await list(bob, { limit: 10, cursor: `${run}-bob1` });
  assert.deepEqual(
    own.proposals.map((p) => p.id),
    [`${run}-bob2`]
  );
});

test("a legacy bare-id cursor keeps the status-derived segment", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  const run = randomUUID().slice(0, 8);
  t.after(() => cleanup([creator]));

  // Newest to oldest: p1, p2, p3. The cursor row p2 is still OPEN.
  for (const [index, id] of ["p1", "p2", "p3"].entries()) {
    await seedProposal(db, {
      id: `${run}-${id}`,
      createdAt: new Date(T0 + (3 - index) * 1000),
      creator,
      walletUnit: `${run}-unit`
    });
  }

  // Bare id + live OPEN status: the page continues in the active segment and
  // returns the strictly older open request.
  const open = await list(creator, { limit: 10, cursor: `${run}-p2` });
  assert.deepEqual(
    open.proposals.map((p) => p.id),
    [`${run}-p3`]
  );

  // Once the cursor row is terminal the bare id derives the terminal segment:
  // no terminal row sits strictly after p2, so the page is empty and the older
  // open request is skipped. That is the pre-token behavior legacy clients
  // keep; only token cursors fix it.
  await db.multiSigProposal.update({
    where: { id: `${run}-p2` },
    data: { status: "SUBMITTED" }
  });
  const terminal = await list(creator, { limit: 10, cursor: `${run}-p2` });
  assert.deepEqual(terminal, { proposals: [], nextCursor: null });
});

test("equal createdAt rows tie-break on id within a page and across a cursor", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  const run = randomUUID().slice(0, 8);
  t.after(() => cleanup([creator]));

  // Two rows share the exact same millisecond; their ids sort zz > aa > 00 and
  // the oldest row sits one second earlier.
  const tieNewest = `${run}-zz`;
  const tieOldest = `${run}-aa`;
  const older = `${run}-00`;
  await seedProposal(db, { id: tieNewest, createdAt: new Date(T0), creator, walletUnit: `${run}-unit` });
  await seedProposal(db, { id: tieOldest, createdAt: new Date(T0), creator, walletUnit: `${run}-unit` });
  await seedProposal(db, { id: older, createdAt: new Date(T0 - 1000), creator, walletUnit: `${run}-unit` });

  // The full list is a total order: id desc breaks the createdAt tie.
  const full = await list(creator, { limit: 10 });
  assert.deepEqual(
    full.proposals.map((p) => p.id),
    [tieNewest, tieOldest, older]
  );

  // A page boundary landing exactly on the tie still reaches the second tied
  // row: keysetAfter must match createdAt equal AND id lt, not createdAt lt.
  const page1 = await list(creator, { limit: 1 });
  assert.deepEqual(
    page1.proposals.map((p) => p.id),
    [tieNewest]
  );
  const page2 = await list(creator, { limit: 10, cursor: page1.nextCursor ?? "" });
  assert.deepEqual(
    page2.proposals.map((p) => p.id),
    [tieOldest, older]
  );
});

// Issue #506: the optional walletUnit narrowing. In these fixtures `other`
// authors every proposal, so a caller-visible row can only come from membership
// (walletUnit in memberUnits) or the proposer fallback, never from authorship
// by the caller by accident. That makes any leak the filter's own fault.
test("the walletUnit filter narrows a multi-unit member to that unit's rows", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const caller = randomUUID();
  const other = randomUUID();
  const run = randomUUID().slice(0, 8);
  const unitA = `${run}-ua`;
  const unitB = `${run}-ub`;
  t.after(() => cleanup([caller, other], [unitA, unitB]));

  await seedWalletWithParticipants(db, unitA, [caller, other]);
  await seedWalletWithParticipants(db, unitB, [caller, other]);
  // Newest to oldest across both units: a-new, a-old, b-new, b-old.
  await seedProposal(db, {
    id: `${run}-a-new`,
    createdAt: new Date(T0 + 3000),
    creator: other,
    walletUnit: unitA
  });
  await seedProposal(db, {
    id: `${run}-a-old`,
    createdAt: new Date(T0 + 2000),
    creator: other,
    walletUnit: unitA
  });
  await seedProposal(db, {
    id: `${run}-b-new`,
    createdAt: new Date(T0 + 1000),
    creator: other,
    walletUnit: unitB
  });
  await seedProposal(db, {
    id: `${run}-b-old`,
    createdAt: new Date(T0),
    creator: other,
    walletUnit: unitB
  });

  // Without the filter a member of both units lists both units' proposals.
  const unfiltered = await list(caller, { limit: 10 });
  assert.deepEqual(
    unfiltered.proposals.map((p) => p.id),
    [`${run}-a-new`, `${run}-a-old`, `${run}-b-new`, `${run}-b-old`]
  );

  // With the filter only that unit's rows survive; ignoring the filter would
  // return all four rows here.
  const onlyA = await list(caller, { limit: 10 }, unitA);
  assert.deepEqual(
    onlyA.proposals.map((p) => p.id),
    [`${run}-a-new`, `${run}-a-old`]
  );
  const onlyB = await list(caller, { limit: 10 }, unitB);
  assert.deepEqual(
    onlyB.proposals.map((p) => p.id),
    [`${run}-b-new`, `${run}-b-old`]
  );
});

test("a unit the caller does not belong to returns nothing, except rows they created", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const caller = randomUUID();
  const other = randomUUID();
  const run = randomUUID().slice(0, 8);
  const ownUnit = `${run}-ua`;
  const foreignUnit = `${run}-ub`;
  t.after(() => cleanup([caller, other], [ownUnit, foreignUnit]));

  await seedWalletWithParticipants(db, ownUnit, [caller, other]);
  // The caller is not a participant of the foreign unit.
  await seedWalletWithParticipants(db, foreignUnit, [other]);
  await seedProposal(db, {
    id: `${run}-ua-new`,
    createdAt: new Date(T0 + 3000),
    creator: other,
    walletUnit: ownUnit
  });
  await seedProposal(db, {
    id: `${run}-ua-old`,
    createdAt: new Date(T0 + 2000),
    creator: other,
    walletUnit: ownUnit
  });
  await seedProposal(db, {
    id: `${run}-ub-new`,
    createdAt: new Date(T0 + 1500),
    creator: other,
    walletUnit: foreignUnit
  });
  await seedProposal(db, {
    id: `${run}-ub-old`,
    createdAt: new Date(T0),
    creator: other,
    walletUnit: foreignUnit
  });

  // The foreign unit holds rows, yet the filtered page is empty. The unfiltered
  // list in the same test run returns the caller's own unit's rows, proving the
  // empty page is the filter's doing and not a broken list path.
  const unfiltered = await list(caller, { limit: 10 });
  assert.deepEqual(
    unfiltered.proposals.map((p) => p.id),
    [`${run}-ua-new`, `${run}-ua-old`]
  );
  const foreign = await list(caller, { limit: 10 }, foreignUnit);
  assert.deepEqual(foreign, { proposals: [], nextCursor: null });

  // The filter narrows visibleWhere; it does not replace it. A proposal the
  // caller created in the foreign unit stays visible under the filter (proposer
  // fallback), while `other`'s rows in that unit stay hidden. A filter that
  // bypassed visibleWhere would leak ub-new/ub-old here.
  await seedProposal(db, {
    id: `${run}-ub-authored`,
    createdAt: new Date(T0 + 500),
    creator: caller,
    walletUnit: foreignUnit
  });
  const filtered = await list(caller, { limit: 10 }, foreignUnit);
  assert.deepEqual(
    filtered.proposals.map((p) => p.id),
    [`${run}-ub-authored`]
  );
});

// The cursor token carries only the segment and sort position captured when the
// page was served; the walletUnit filter is applied fresh on every request from
// the caller's argument. So pages continue strictly within the filtered set,
// and a token captured under one unit replayed against another re-anchors into
// that unit's list without ever widening visibility (same contract as a status
// flip between pages: the token positions, the caller's filters narrow).
test("cursor pagination keeps narrowing to the filtered unit across pages", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const caller = randomUUID();
  const other = randomUUID();
  const run = randomUUID().slice(0, 8);
  const unitA = `${run}-ua`;
  const unitB = `${run}-ub`;
  t.after(() => cleanup([caller, other], [unitA, unitB]));

  await seedWalletWithParticipants(db, unitA, [caller, other]);
  await seedWalletWithParticipants(db, unitB, [caller, other]);
  // Global time order interleaves the units: a1, b1, a2, a3, a4, b2. The
  // interleaving is the point: a filter that only shaped page 1 would leak b2
  // into page 2.
  await seedProposal(db, { id: `${run}-a1`, createdAt: new Date(T0 + 6000), creator: other, walletUnit: unitA });
  await seedProposal(db, { id: `${run}-b1`, createdAt: new Date(T0 + 5000), creator: other, walletUnit: unitB });
  await seedProposal(db, { id: `${run}-a2`, createdAt: new Date(T0 + 4000), creator: other, walletUnit: unitA });
  await seedProposal(db, { id: `${run}-a3`, createdAt: new Date(T0 + 3000), creator: other, walletUnit: unitA });
  await seedProposal(db, { id: `${run}-a4`, createdAt: new Date(T0 + 2000), creator: other, walletUnit: unitA });
  await seedProposal(db, { id: `${run}-b2`, createdAt: new Date(T0 + 1000), creator: other, walletUnit: unitB });

  const page1 = await list(caller, { limit: 2 }, unitA);
  assert.deepEqual(
    page1.proposals.map((p) => p.id),
    [`${run}-a1`, `${run}-a2`]
  );
  const token = decodeProposalCursor(page1.nextCursor ?? "");
  assert.ok(token, "page 1 must end on a decodeable cursor token");
  assert.equal(token.segment, "active");
  assert.equal(token.id, `${run}-a2`);

  // Page 2 continues strictly after a2 within unitA: b1 (globally newer than
  // a2) and b2 (globally older than a4) never surface. Exhausted: nextCursor
  // is null even though unfiltered pages would have more rows.
  const page2 = await list(caller, { limit: 3, cursor: page1.nextCursor ?? "" }, unitA);
  assert.deepEqual(
    page2.proposals.map((p) => p.id),
    [`${run}-a3`, `${run}-a4`]
  );
  assert.equal(page2.nextCursor, null);
});
