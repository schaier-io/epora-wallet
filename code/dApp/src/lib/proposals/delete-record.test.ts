import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Prisma } from "@/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import { deleteFinishedProposalRecord } from "./delete-record";

const DB_SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL not set; run via `pnpm test`";

// The delete path reads only the creator and the status, so the fixture fills
// the remaining required columns with inert values.
function proposalRow(creator: string, status: string): Prisma.MultiSigProposalCreateInput {
  return {
    network: "preprod",
    walletUnit: `unit-${randomUUID()}`,
    walletPolicyId: randomUUID(),
    title: "Delete me",
    actionKind: "use",
    authorityPath: "multisig",
    builder: "use",
    buildContextJson: "{}",
    unsignedTxHex: "80",
    txBodyHash: randomUUID().replaceAll("-", ""),
    status,
    createdByKeyHash: creator
  };
}

// Every row carries the run's creator key, so cleanup removes exactly what the
// test (and nothing else) created, whatever an assertion failure interrupted.
async function cleanup(creator: string): Promise<void> {
  await getPrisma().multiSigProposal.deleteMany({ where: { createdByKeyHash: creator } });
}

test("deleteFinishedProposalRecord removes a finished proposal with its signatures", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  const outsider = randomUUID();
  t.after(() => cleanup(creator));

  const withdrawn = await db.multiSigProposal.create({
    data: {
      ...proposalRow(creator, "CANCELLED"),
      signatures: {
        create: { signerKeyHash: outsider, witnessSetHex: "ffff", txBodyHash: randomUUID().replaceAll("-", "") }
      }
    }
  });

  // A co-signer cannot delete a request they did not create.
  const rejected = await deleteFinishedProposalRecord(db, {
    proposalId: withdrawn.id,
    actorKeyHash: outsider
  });
  assert.deepEqual(rejected, {
    ok: false,
    status: 403,
    error: "Only the wallet that created this request can delete it."
  });
  assert.equal(await db.multiSigProposal.count({ where: { id: withdrawn.id } }), 1);

  // The creator deletes the withdrawn request; the recorded signature cascades.
  const deleted = await deleteFinishedProposalRecord(db, {
    proposalId: withdrawn.id,
    actorKeyHash: creator
  });
  assert.deepEqual(deleted, { ok: true });
  assert.equal(await db.multiSigProposal.count({ where: { id: withdrawn.id } }), 0);
  assert.equal(await db.proposalSignature.count({ where: { proposalId: withdrawn.id } }), 0);
});

test("deleteFinishedProposalRecord refuses an unfinished proposal", { skip: DB_SKIP }, async (t) => {
  const db = getPrisma();
  const creator = randomUUID();
  t.after(() => cleanup(creator));

  // OPEN still awaits signatures; SUBMITTING may already sit on the chain.
  for (const status of ["OPEN", "SUBMITTING"]) {
    const active = await db.multiSigProposal.create({ data: proposalRow(creator, status) });
    const rejected = await deleteFinishedProposalRecord(db, {
      proposalId: active.id,
      actorKeyHash: creator
    });
    assert.deepEqual(rejected, {
      ok: false,
      status: 409,
      error: `Proposal is ${status.toLowerCase()}.`
    });
    assert.equal(await db.multiSigProposal.count({ where: { id: active.id } }), 1);
  }

  assert.deepEqual(
    await deleteFinishedProposalRecord(db, { proposalId: "missing", actorKeyHash: creator }),
    { ok: false, status: 404, error: "Proposal not found." }
  );
});
