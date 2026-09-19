import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrisma } from "@/lib/prisma";
import { createProposalRecord, ProposalQuotaExceededError } from "./create-record";
import { MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET, PROPOSAL_CREATION_QUOTA_WINDOW_MS } from "./limits";
import type { CreateProposalRequest } from "./types";

const DB_SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL not set; run via `pnpm test`";

function bodyHash(): string {
  return randomUUID().replaceAll("-", "");
}

// The create path reads the creator, the wallet, and the tx identity, so the
// fixture fills the remaining required columns with inert values.
function createRequest(overrides: Partial<CreateProposalRequest> = {}): CreateProposalRequest {
  return {
    walletUnit: `unit-${randomUUID()}`,
    walletPolicyId: randomUUID(),
    title: "Spend",
    actionKind: "use",
    authorityPath: "multisig",
    builder: "stt-spend",
    buildContext: { builder: "stt-spend" } as unknown as CreateProposalRequest["buildContext"],
    unsignedTxHex: "80",
    txBodyHash: bodyHash(),
    ...overrides
  };
}

// Every row carries the run's creator key, so cleanup removes exactly what the
// test (and nothing else) created, whatever an assertion failure interrupted.
async function cleanup(creators: string[]): Promise<void> {
  await getPrisma().multiSigProposal.deleteMany({ where: { createdByKeyHash: { in: creators } } });
}

test("a re-saved draft maps back to the original proposal instead of writing a second row", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  t.after(() => cleanup([creator]));

  const request = createRequest();
  const first = await createProposalRecord(db, request, creator);
  const second = await createProposalRecord(db, request, creator);

  // The double-create window: both saves resolve to the same stored request.
  assert.equal(second.id, first.id);
  assert.equal(second.unsignedTxHex, request.unsignedTxHex);
  assert.equal(
    await db.multiSigProposal.count({
      where: { createdByKeyHash: creator, txBodyHash: request.txBodyHash }
    }),
    1
  );
});

test("the same transaction body from a different creator files its own proposal", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creatorA = randomUUID();
  const creatorB = randomUUID();
  t.after(() => cleanup([creatorA, creatorB]));

  const request = createRequest();
  const fromA = await createProposalRecord(db, request, creatorA);
  const fromB = await createProposalRecord(db, request, creatorB);

  assert.notEqual(fromB.id, fromA.id);
  assert.equal(
    await db.multiSigProposal.count({
      where: { walletUnit: request.walletUnit, txBodyHash: request.txBodyHash }
    }),
    2
  );
});

test("a changed transaction body files a second proposal", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  t.after(() => cleanup([creator]));

  const request = createRequest();
  const first = await createProposalRecord(db, request, creator);
  const rebuilt = await createProposalRecord(
    db,
    { ...request, unsignedTxHex: "a0", txBodyHash: bodyHash() },
    creator
  );

  assert.notEqual(rebuilt.id, first.id);
  assert.equal(await db.multiSigProposal.count({ where: { createdByKeyHash: creator } }), 2);
});

test("a withdrawn original does not swallow a re-filed duplicate", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  t.after(() => cleanup([creator]));

  const request = createRequest();
  const withdrawn = await createProposalRecord(db, request, creator);
  await db.multiSigProposal.update({
    where: { id: withdrawn.id },
    data: { status: "CANCELLED" }
  });

  const refiled = await createProposalRecord(db, request, creator);

  // The creator withdrew the original on purpose; the re-file is a new request.
  assert.notEqual(refiled.id, withdrawn.id);
  assert.equal(await db.multiSigProposal.count({ where: { createdByKeyHash: creator } }), 2);
});

test("a duplicate outside the creation window files a new proposal", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  t.after(() => cleanup([creator]));

  const request = createRequest();
  const original = await createProposalRecord(db, request, creator);
  await db.multiSigProposal.update({
    where: { id: original.id },
    data: { createdAt: new Date(Date.now() - PROPOSAL_CREATION_QUOTA_WINDOW_MS - 60 * 60 * 1000) }
  });

  const refiled = await createProposalRecord(db, request, creator);

  assert.notEqual(refiled.id, original.id);
  assert.equal(await db.multiSigProposal.count({ where: { createdByKeyHash: creator } }), 2);
});

test("distinct bodies never dedupe and the open-proposal quota still applies", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  t.after(() => cleanup([creator]));

  const request = createRequest();
  for (let index = 0; index < MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET; index += 1) {
    await createProposalRecord(db, { ...request, txBodyHash: bodyHash() }, creator);
  }

  await assert.rejects(
    () => createProposalRecord(db, { ...request, txBodyHash: bodyHash() }, creator),
    ProposalQuotaExceededError
  );
  assert.equal(
    await db.multiSigProposal.count({ where: { createdByKeyHash: creator } }),
    MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET
  );
});
