import assert from "node:assert/strict";
import test from "node:test";
import { sttSyncLockConnectionString, withSttSyncAdvisoryLock, type SttSyncLockClient } from "./sync-lock";

test("uses the direct URL for session locks and refuses a pooled-only URL", () => {
  const pooled = "postgresql://localhost-pooler.example/wallet";
  const direct = "postgresql://localhost.example/wallet";
  assert.equal(sttSyncLockConnectionString({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct }), direct);
  assert.equal(sttSyncLockConnectionString({ DATABASE_URL: direct }), direct);
  assert.throws(() => sttSyncLockConnectionString({ DATABASE_URL: pooled }), /DATABASE_URL_UNPOOLED/);
  assert.throws(() => sttSyncLockConnectionString({ DATABASE_URL: `${direct}?pgbouncer=true` }), /DATABASE_URL_UNPOOLED/);
  assert.throws(() => sttSyncLockConnectionString({ DATABASE_URL: direct, DATABASE_URL_UNPOOLED: pooled }), /DATABASE_URL_UNPOOLED/);
});

test("skips duplicate sync work when another process owns the advisory lock", async () => {
  let taskRan = false;
  let ended = false;
  const client: SttSyncLockClient = {
    query: async () => ({ rows: [{ acquired: false }] }),
    end: async () => {
      ended = true;
    }
  };

  const result = await withSttSyncAdvisoryLock(
    async () => {
      taskRan = true;
      return "done";
    },
    async () => client
  );

  assert.deepEqual(result, { acquired: false });
  assert.equal(taskRan, false);
  assert.equal(ended, true);
});

test("releases the advisory lock after protected sync work", async () => {
  const queries: string[] = [];
  const client: SttSyncLockClient = {
    query: async (sql) => {
      queries.push(sql);
      return { rows: [{ acquired: true }] };
    },
    end: async () => undefined
  };

  const result = await withSttSyncAdvisoryLock(async () => "done", async () => client);

  assert.deepEqual(result, { acquired: true, result: "done" });
  assert.match(queries.at(-1) ?? "", /pg_advisory_unlock/);
});

test("releases and closes the session when protected work throws", async () => {
  const queries: string[] = [];
  let ended = false;
  const client: SttSyncLockClient = {
    query: async (sql) => {
      queries.push(sql);
      return { rows: [{ acquired: true }] };
    },
    end: async () => { ended = true; }
  };
  await assert.rejects(withSttSyncAdvisoryLock(async () => { throw new Error("provider unavailable"); }, async () => client));
  assert.match(queries.at(-1) ?? "", /pg_advisory_unlock/);
  assert.equal(ended, true);
});
