import { PrismaClient } from "@/generated/prisma";
import { createPrismaAdapter } from "@/lib/prisma-adapter";

type GlobalPrisma = typeof globalThis & {
  __permissionWalletPrisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalPrisma;

export const prisma =
  globalForPrisma.__permissionWalletPrisma ??
  new PrismaClient({
    adapter: createPrismaAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__permissionWalletPrisma = prisma;
}
