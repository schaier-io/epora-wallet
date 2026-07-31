import { PrismaPg } from "@prisma/adapter-pg";

export function getDatabaseSchema(connectionString = process.env.DATABASE_URL): string {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  try {
    return new URL(connectionString).searchParams.get("schema") ?? "public";
  } catch {
    return "public";
  }
}

/** Quote a trusted database identifier for use with Prisma.raw. */
export function quotePostgresIdentifier(identifier: string): string {
  if (identifier.length === 0 || identifier.includes("\0")) {
    throw new Error("PostgreSQL schema name is invalid.");
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * Prisma 7 requires an explicit driver adapter instead of a connection URL in
 * the schema. The underlying `pg` driver ignores the `?schema=` query parameter
 * that Prisma used to parse from the connection string, so we extract it and
 * pass it to the adapter explicitly (used by the test suite's `stt_test` schema).
 */
export function createPrismaAdapter(
  connectionString = process.env.DATABASE_URL
) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const schema = getDatabaseSchema(connectionString);

  return new PrismaPg({ connectionString }, { schema });
}
