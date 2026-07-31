import assert from "node:assert/strict";
import test from "node:test";
import { withSttSyncAdvisoryLock, type SttSyncLockClient } from "./sync-lock";

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
