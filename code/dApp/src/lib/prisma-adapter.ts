import { PrismaPg } from "@prisma/adapter-pg";

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

  let schema: string | undefined;
  try {
    schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
  } catch {
    schema = undefined;
  }

  return new PrismaPg({ connectionString }, schema ? { schema } : undefined);
}
