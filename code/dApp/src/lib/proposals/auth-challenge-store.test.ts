import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPrisma } from "@/lib/prisma";
import { issueStoredNonce, consumeStoredNonce } from "./auth-challenge-store";
import { verifyNonce } from "./auth";

const DB_SKIP = process.env.DATABASE_URL
  ? false
  : "DATABASE_URL not set — run via `pnpm test`";

test("a persisted proposal nonce can be consumed only once", { skip: DB_SKIP }, async (t) => {
  process.env.PROPOSAL_AUTH_SECRET = "test-secret-at-least-32-characters-long";
  const address = `addr_test1_${randomUUID()}`;
  const token = await issueStoredNonce(address);
  const verified = verifyNonce(token, address);
  assert.equal(verified.ok, true);
  if (!verified.ok) {
    return;
  }
  t.after(async () => {
    await getPrisma().proposalAuthChallenge.delete({ where: { id: verified.challengeId } });
  });

  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => consumeStoredNonce(verified))
  );
  assert.equal(attempts.filter(Boolean).length, 1);
});
