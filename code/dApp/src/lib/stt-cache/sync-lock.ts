import { Client } from "pg";

const LOCK_NAMESPACE = 0x45504f52;
const LOCK_RESOURCE = 0x53545453;

export type SttSyncLockClient = {
  query: (
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: { acquired?: boolean }[] }>;
  end: () => Promise<unknown>;
};

type ConnectLockClient = () => Promise<SttSyncLockClient>;

async function connectLockClient(): Promise<SttSyncLockClient> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = new Client({ connectionString });
  await client.connect();
  return {
    query: async (sql, values) => client.query(sql, values),
    end: () => client.end()
  };
}

export async function withSttSyncAdvisoryLock<T>(
  task: () => Promise<T>,
  connect: ConnectLockClient = connectLockClient
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  const client = await connect();
  let acquired = false;
  try {
    const lock = await client.query(
      "SELECT pg_try_advisory_lock($1, $2) AS acquired",
      [LOCK_NAMESPACE, LOCK_RESOURCE]
    );
    acquired = lock.rows[0]?.acquired === true;
    if (!acquired) {
      return { acquired: false };
    }
    return { acquired: true, result: await task() };
  } finally {
    try {
      if (acquired) {
        await client.query("SELECT pg_advisory_unlock($1, $2) AS acquired", [
          LOCK_NAMESPACE,
          LOCK_RESOURCE
        ]);
      }
    } finally {
      await client.end();
    }
  }
}
