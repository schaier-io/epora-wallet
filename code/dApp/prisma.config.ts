import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads the connection URL from schema.prisma, and the CLI
// no longer auto-loads `.env`. Next.js still loads `.env` for the running app,
// but CLI commands (generate / db push / migrate) need it loaded here. An
// already-set DATABASE_URL (e.g. inlined by the test script) takes precedence.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present (e.g. CI providing env vars directly) — ignore.
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
