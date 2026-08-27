import { z } from "zod";

// Single home for server-side environment configuration. Server modules read
// env through here instead of ad-hoc `process.env.X` so that:
//  - missing/malformed values fail with one consistent, actionable message,
//  - tests can inject a plain record instead of mutating process.env,
//  - `.env.example` has a checkable source of truth.
//
// Deliberately NOT importing "server-only": node:test cannot load modules that
// do, and nothing here is secret by itself. In a client bundle these dynamic
// reads resolve to undefined (only literal NEXT_PUBLIC_* accesses are inlined
// by Next; those live in ./client-env.ts).

const serverEnvSchema = z.object({
  BLOCKFROST_PREPROD_PROJECT_ID: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  STT_SYNC_SECRET: z.string().optional(),
  PROPOSAL_AUTH_SECRET: z.string().optional(),
  KOIOS_URL: z.url().optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  VERCEL_URL: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  raw: Record<string, string | undefined> = process.env
): ServerEnv {
  // Empty or whitespace-only values (e.g. `KOIOS_URL=` in .env) count as unset.
  const normalized: Record<string, string | undefined> = {};
  for (const key of Object.keys(serverEnvSchema.shape)) {
    const value = raw[key]?.trim();
    normalized[key] = value === "" ? undefined : value;
  }

  const result = serverEnvSchema.safeParse(normalized);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Invalid environment configuration: ${details}. See .env.example for the expected values.`
    );
  }
  return result.data;
}

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv();
  return cached;
}

export function requireServerEnv(
  key: keyof ServerEnv,
  env: ServerEnv = getServerEnv()
): string {
  const value = env[key];
  if (!value) {
    throw new Error(
      `Missing ${key} in environment. Copy .env.example to .env.local and set it.`
    );
  }
  return value;
}

// Stable dev fallback so local development works without configuration. In
// production a real secret is mandatory, because a predictable secret would let anyone
// forge proposal sessions.
const DEV_FALLBACK_PROPOSAL_SECRET = "permission-wallet-dev-proposal-secret";

const PRODUCTION_SECRET_MIN_LENGTH = 32;
const KNOWN_WEAK_SECRETS = new Set([
  "change-me",
  "changeme",
  "password",
  "replace-me",
  "secret",
  DEV_FALLBACK_PROPOSAL_SECRET
]);

function assertStrongProductionSecret(
  key: "PROPOSAL_AUTH_SECRET" | "STT_SYNC_SECRET",
  value: string,
  env: ServerEnv
): string {
  if (env.NODE_ENV !== "production") {
    return value;
  }

  if (
    value.length < PRODUCTION_SECRET_MIN_LENGTH ||
    KNOWN_WEAK_SECRETS.has(value.toLowerCase())
  ) {
    throw new Error(
      `${key} must be at least ${PRODUCTION_SECRET_MIN_LENGTH} random characters in production. ` +
        "Generate a unique value with `openssl rand -base64 32`."
    );
  }

  return value;
}

export function getProposalAuthSecret(env: ServerEnv = getServerEnv()): string {
  if (env.PROPOSAL_AUTH_SECRET) {
    return assertStrongProductionSecret("PROPOSAL_AUTH_SECRET", env.PROPOSAL_AUTH_SECRET, env);
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "PROPOSAL_AUTH_SECRET must be set in production to sign proposal sessions."
    );
  }
  return DEV_FALLBACK_PROPOSAL_SECRET;
}

export function getSttSyncSecret(env: ServerEnv = getServerEnv()): string {
  const value = requireServerEnv("STT_SYNC_SECRET", env);
  return assertStrongProductionSecret("STT_SYNC_SECRET", value, env);
}

const DEFAULT_SITE_URL = "http://localhost:3000";

// Absolute base URL for public/canonical URLs (metadata, robots, sitemap).
// Explicit NEXT_PUBLIC_SITE_URL wins; on Vercel the injected VERCEL_URL is the
// fallback; local dev bottoms out at localhost.
export function getSiteUrl(env: ServerEnv = getServerEnv()): string {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL;
  }
  if (env.VERCEL_URL) {
    return `https://${env.VERCEL_URL}`;
  }
  return DEFAULT_SITE_URL;
}
