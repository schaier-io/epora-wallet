import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma";
import type { ProposalBuildContext } from "./types";

const prisma = vi.hoisted(() => ({ current: null as PrismaClient | null }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma.current }));
vi.mock("./verify", () => ({ decodeRequiredSigners: () => ["signer"] }));
vi.mock("./witness-validation", () => ({ validateVKeyWitnessSet: (input: { witnessSetHex: string }) => input }));
import { replaceProposalBuild, upsertProposalSignature } from "./store";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

// Model PostgreSQL's parent row lock: SELECT FOR UPDATE and UPDATE conflict.
// This tests call ordering and serialization, without a database connection.
function database(pauseRebuild = false) {
  let row = { id: "proposal", txBodyHash: "old-body", unsignedTxHex: "old-tx", status: "OPEN", createdByKeyHash: "creator" };
  let witness: { txBodyHash: string } | null = null;
  let lockTail = Promise.resolve();
  const upsertStarted = deferred();
  const releaseUpsert = deferred();
  const rebuildStarted = deferred();
  const rebuildLocked = deferred();
  const releaseRebuild = deferred();
  let pauseNextUpsert = true;
  let rebuildUpdated = false;
  const makeClient = () => {
    let releaseLock: (() => void) | undefined;
    const acquireLock = async () => {
      if (releaseLock) return;
      const previous = lockTail;
      const held = deferred();
      lockTail = held.promise;
      await previous;
      releaseLock = held.resolve;
    };
    const client = {
      $queryRaw: vi.fn(async (sql: TemplateStringsArray, id: string) => {
        expect(sql.join("?")).toMatch(/SELECT.*"MultiSigProposal".*FOR UPDATE/s);
        expect(id).toBe("proposal");
        await acquireLock();
        return [{ id }];
      }),
      multiSigProposal: {
        findUnique: async () => ({ ...row }),
        updateMany: async (args: { where: { txBodyHash: string }; data: Partial<typeof row> }) => {
          rebuildStarted.resolve();
          await acquireLock();
          rebuildLocked.resolve();
          if (pauseRebuild) await releaseRebuild.promise;
          if (row.txBodyHash !== args.where.txBodyHash) return { count: 0 };
          row = { ...row, ...args.data };
          rebuildUpdated = true;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ ...row, walletUnit: "wallet", walletPolicyId: "policy", title: "Proposal", description: null, actionKind: "use", authorityPath: "admin", submittedTxHash: null, createdAt: new Date(0), updatedAt: new Date(0), signatures: [], buildContextJson: "{}", summaryJson: null })
      },
      proposalSignature: {
        upsert: async (args: { create: { txBodyHash: string } }) => {
          if (pauseNextUpsert) {
            pauseNextUpsert = false;
            upsertStarted.resolve();
            await releaseUpsert.promise;
          }
          witness = { ...args.create };
        },
        deleteMany: async () => { witness = null; }
      }
    };
    return { client, release: () => releaseLock?.() };
  };
  const direct = makeClient();
  const db = {
    ...direct.client,
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const transaction = makeClient();
      try { return await run(transaction.client); }
      finally { transaction.release(); }
    }
  };
  return { db: db as unknown as PrismaClient, upsertStarted, releaseUpsert, rebuildStarted, rebuildLocked, releaseRebuild, witness: () => witness, rebuilt: () => rebuildUpdated };
}
const rebuildArgs = { proposalId: "proposal", actorKeyHash: "creator", expectedBodyHash: "old-body", unsignedTxHex: "new-tx", txBodyHash: "new-body", buildContext: { builder: "stt-spend" } as ProposalBuildContext };
const signatureArgs = { proposalId: "proposal", signerKeyHash: "signer", witnessSetHex: "old-witness", expectedBodyHash: "old-body" };

it("keeps rebuild behind an in-flight signature until its guarded write completes", async () => {
  const state = database();
  prisma.current = state.db;
  const oldSignature = upsertProposalSignature(signatureArgs);
  await state.upsertStarted.promise;
  const rebuild = replaceProposalBuild(rebuildArgs);
  await state.rebuildStarted.promise;
  // The UPDATE has reached lock acquisition; drain its immediate continuation.
  await Promise.resolve();
  await Promise.resolve();
  const rebuiltBeforeSignature = state.rebuilt();
  state.releaseUpsert.resolve();
  expect(await oldSignature).toEqual({ ok: true });
  expect((await rebuild).ok).toBe(true);
  expect(rebuiltBeforeSignature).toBe(false);
  expect(state.witness()).toBeNull();
  expect(await upsertProposalSignature({ ...signatureArgs, expectedBodyHash: "new-body", witnessSetHex: "new-witness" })).toEqual({ ok: true });
  expect(state.witness()?.txBodyHash).toBe("new-body");
});

it("rejects an old body after rebuild without replacing the new witness", async () => {
  const state = database();
  prisma.current = state.db;
  state.releaseUpsert.resolve();
  await replaceProposalBuild(rebuildArgs);
  await upsertProposalSignature({ ...signatureArgs, expectedBodyHash: "new-body", witnessSetHex: "new-witness" });
  expect(await upsertProposalSignature(signatureArgs)).toMatchObject({ ok: false, status: 409 });
  expect(state.witness()?.txBodyHash).toBe("new-body");
});


it("reads the guarded body after an earlier rebuild releases its row lock", async () => {
  const state = database(true);
  prisma.current = state.db;
  state.releaseUpsert.resolve();
  const rebuild = replaceProposalBuild(rebuildArgs);
  await state.rebuildLocked.promise;
  // Rebuild holds the row lock but has not replaced the old body yet.
  const staleSignature = upsertProposalSignature(signatureArgs);
  await Promise.resolve();
  await Promise.resolve();
  state.releaseRebuild.resolve();
  expect((await rebuild).ok).toBe(true);
  expect(await staleSignature).toMatchObject({ ok: false, status: 409 });
  expect(state.witness()).toBeNull();
});
