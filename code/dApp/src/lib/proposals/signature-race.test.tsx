import { beforeEach, expect, it, vi } from "vitest";
import * as crypto from "@harmoniclabs/crypto";
import { createVKeyWitnessSetHex } from "@/lib/mesh/cst";
import { upsertProposalSignature } from "./store";

const mocks = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => mocks.db }));
vi.mock("./verify", () => ({ decodeRequiredSigners: () => [] }));
const OLD_HASH = "11".repeat(32);
const NEW_HASH = "22".repeat(32);
function signature(txBodyHash: string) {
  const signed = crypto.signEd25519_sync(Buffer.from(txBodyHash, "hex"), new Uint8Array(32).fill(7));
  return {
    proposalId: "proposal", expectedBodyHash: txBodyHash,
    signerKeyHash: Buffer.from(crypto.blake2b_224(signed.pubKey)).toString("hex"),
    witnessSetHex: createVKeyWitnessSetHex([{
      publicKeyHex: Buffer.from(signed.pubKey).toString("hex"),
      signatureHex: Buffer.from(signed.signature).toString("hex")
    }])
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
let row: { id: string; txBodyHash: string; status: string; unsignedTxHex: string };
let stored: { txBodyHash: string } | undefined;
let lockStarted: ReturnType<typeof deferred>;
let releaseLock: ReturnType<typeof deferred>;
let holdLock: boolean;
let writesInTransaction: boolean[];
beforeEach(() => {
  row = { id: "proposal", txBodyHash: OLD_HASH, status: "OPEN", unsignedTxHex: "80" };
  stored = undefined;
  lockStarted = deferred(); releaseLock = deferred(); holdLock = true;
  writesInTransaction = [];
  const client = (transactional: boolean) => ({
    // Delay lock acquisition, not a read made while the row is already locked.
    // The separate concurrency suite models lock ownership through commit.
    $queryRaw: vi.fn(async (sql: TemplateStringsArray, id: string) => {
      expect(sql.join("?")).toMatch(/SELECT.*"MultiSigProposal".*FOR UPDATE/s);
      expect(id).toBe("proposal");
      if (holdLock) {
        holdLock = false; lockStarted.resolve(); await releaseLock.promise;
      }
      return [{ id }];
    }),
    multiSigProposal: {
      findUnique: async () => ({ ...row })
    },
    proposalSignature: {
      upsert: async ({ create, update }: { create: { txBodyHash: string }; update: { txBodyHash: string } }) => {
        writesInTransaction.push(transactional);
        stored = stored ? { ...update } : { ...create };
      }
    }
  });
  mocks.db = { ...client(false), $transaction: async (callback: (tx: unknown) => unknown) => callback(client(true)) };
});
it("keeps the rebuilt body's approval after an old signature waits for the row lock", async () => {
  const oldSign = upsertProposalSignature(signature(OLD_HASH));
  await lockStarted.promise;
  row.txBodyHash = NEW_HASH;
  expect(await upsertProposalSignature(signature(NEW_HASH))).toEqual({ ok: true });
  releaseLock.resolve();
  expect(await oldSign).toMatchObject({ ok: false, status: 409 });
  expect(stored?.txBodyHash).toBe(NEW_HASH);
});
it.each(["SUBMITTING", "CANCELLED"])("refuses a signature waiting for the row lock after the proposal becomes %s", async status => {
  const pending = upsertProposalSignature(signature(OLD_HASH));
  await lockStarted.promise;
  row.status = status; releaseLock.resolve();
  expect(await pending).toMatchObject({ ok: false, status: 409 });
  expect(stored).toBeUndefined();
});
it("stores an accepted signature through the same transaction client", async () => {
  holdLock = false;
  expect(await upsertProposalSignature(signature(OLD_HASH))).toEqual({ ok: true });
  expect(writesInTransaction).toEqual([true]);
});
