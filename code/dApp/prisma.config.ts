import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads the connection URL from schema.prisma, and the CLI
// no longer auto-loads `.env`. Next.js still loads `.env` for the running app,
// but CLI commands (generate / db push / migrate) need it loaded here. An
// already-set URL (e.g. inlined by the test script) takes precedence.
if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present (e.g. CI providing env vars directly), so ignore it.
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    // CLI schema operations use a direct connection. Runtime queries still
    // use DATABASE_URL in prisma-adapter.ts. Local databases need only one URL.
    url: process.env.DATABASE_URL_UNPOOLED || env("DATABASE_URL")
  }
});
