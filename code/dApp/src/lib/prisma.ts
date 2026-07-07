import { PrismaClient } from "@/generated/prisma";
import { createPrismaAdapter } from "@/lib/prisma-adapter";

type GlobalPrisma = typeof globalThis & {
  __permissionWalletPrisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalPrisma;

let cached: PrismaClient | null = null;

// Lazy so merely importing this module (e.g. transitively from a unit test
// without DATABASE_URL) never constructs a client — it is built on first use.
// The global slot survives Next dev hot-reloads, which re-evaluate modules.
export function getPrisma(): PrismaClient {
  if (cached) {
    return cached;
  }
  cached =
    globalForPrisma.__permissionWalletPrisma ??
    new PrismaClient({
      adapter: createPrismaAdapter(),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
    });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.__permissionWalletPrisma = cached;
  }
  return cached;
}
