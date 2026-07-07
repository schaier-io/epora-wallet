import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getProposalAuthSecret,
  getSiteUrl,
  parseServerEnv,
  requireServerEnv
} from "./server-env";

test("parseServerEnv treats empty and whitespace-only values as unset", () => {
  const env = parseServerEnv({
    KOIOS_URL: "",
    BLOCKFROST_PREPROD_PROJECT_ID: "   ",
    STT_SYNC_SECRET: " secret "
  });
  assert.equal(env.KOIOS_URL, undefined);
  assert.equal(env.BLOCKFROST_PREPROD_PROJECT_ID, undefined);
  assert.equal(env.STT_SYNC_SECRET, "secret");
});

test("parseServerEnv rejects malformed URLs with an actionable message", () => {
  assert.throws(
    () => parseServerEnv({ KOIOS_URL: "not-a-url" }),
    /KOIOS_URL.*\.env\.example/s
  );
});

test("parseServerEnv ignores unknown keys", () => {
  const env = parseServerEnv({ TOTALLY_UNRELATED: "x" });
  assert.equal("TOTALLY_UNRELATED" in env, false);
});

test("requireServerEnv returns the value when set", () => {
  const env = parseServerEnv({ BLOCKFROST_PREPROD_PROJECT_ID: "preprodKey" });
  assert.equal(requireServerEnv("BLOCKFROST_PREPROD_PROJECT_ID", env), "preprodKey");
});

test("requireServerEnv throws naming the missing key", () => {
  const env = parseServerEnv({});
  assert.throws(
    () => requireServerEnv("STT_SYNC_SECRET", env),
    /Missing STT_SYNC_SECRET/
  );
});

test("getProposalAuthSecret prefers the configured secret", () => {
  const env = parseServerEnv({ PROPOSAL_AUTH_SECRET: "real-secret" });
  assert.equal(getProposalAuthSecret(env), "real-secret");
});

test("getProposalAuthSecret falls back to a stable dev secret outside production", () => {
  const env = parseServerEnv({ NODE_ENV: "development" });
  assert.equal(getProposalAuthSecret(env), getProposalAuthSecret(env));
  assert.ok(getProposalAuthSecret(env).length > 0);
});

test("getProposalAuthSecret throws in production when unset", () => {
  const env = parseServerEnv({ NODE_ENV: "production" });
  assert.throws(() => getProposalAuthSecret(env), /PROPOSAL_AUTH_SECRET/);
});

test("getSiteUrl precedence: explicit > VERCEL_URL > localhost", () => {
  assert.equal(
    getSiteUrl(parseServerEnv({ NEXT_PUBLIC_SITE_URL: "https://example.com", VERCEL_URL: "x.vercel.app" })),
    "https://example.com"
  );
  assert.equal(
    getSiteUrl(parseServerEnv({ VERCEL_URL: "x.vercel.app" })),
    "https://x.vercel.app"
  );
  assert.equal(getSiteUrl(parseServerEnv({})), "http://localhost:3000");
});
