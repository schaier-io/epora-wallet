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

// Session advisory locks need one dedicated PostgreSQL session. A transaction
// pooler can assign the unlock to a different backend, leaving the lock held.
export function sttSyncLockConnectionString(
  env: { DATABASE_URL?: string; DATABASE_URL_UNPOOLED?: string } = {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED
  }
): string {
  const connectionString = env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const url = new URL(connectionString);
  if (url.hostname.includes("-pooler.") || url.searchParams.get("pgbouncer") === "true") {
    throw new Error("STT sync requires a direct DATABASE_URL_UNPOOLED connection for its advisory lock.");
  }
  return connectionString;
}

async function connectLockClient(): Promise<SttSyncLockClient> {
  const connectionString = sttSyncLockConnectionString();
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
