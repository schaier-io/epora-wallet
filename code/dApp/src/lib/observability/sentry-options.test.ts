import assert from "node:assert/strict";
import test from "node:test";

import { buildSentryInitOptions } from "./sentry-options";

test("buildSentryInitOptions returns undefined without a DSN (the init gate)", () => {
  assert.equal(buildSentryInitOptions({}), undefined);
  assert.equal(buildSentryInitOptions({ dsn: "" }), undefined);
  assert.equal(buildSentryInitOptions({ dsn: "   " }), undefined);
  assert.equal(
    buildSentryInitOptions({ release: "abc", commitSha: "def", nodeEnv: "production" }),
    undefined,
    "release and environment values must not enable Sentry on their own"
  );
});

test("buildSentryInitOptions enables capture from a DSN alone", () => {
  const options = buildSentryInitOptions({ dsn: "https://key@o0.ingest.sentry.io/0" });
  assert.ok(options);
  assert.equal(options.dsn, "https://key@o0.ingest.sentry.io/0");
  assert.equal(options.release, undefined);
});

test("buildSentryInitOptions prefers an explicit release over the commit SHA", () => {
  const options = buildSentryInitOptions({
    dsn: "https://key@o0.ingest.sentry.io/0",
    release: "v1.2.3",
    commitSha: "abcdef1234567890"
  });
  assert.ok(options);
  assert.equal(options.release, "v1.2.3");
});

test("buildSentryInitOptions falls back to the commit SHA as the release", () => {
  const options = buildSentryInitOptions({
    dsn: "https://key@o0.ingest.sentry.io/0",
    commitSha: "abcdef1234567890"
  });
  assert.ok(options);
  assert.equal(options.release, "abcdef1234567890");
});

test("buildSentryInitOptions derives the environment from NODE_ENV, then defaults", () => {
  const fromNodeEnv = buildSentryInitOptions({
    dsn: "https://key@o0.ingest.sentry.io/0",
    nodeEnv: "development"
  });
  assert.ok(fromNodeEnv);
  assert.equal(fromNodeEnv.environment, "development");

  const fallback = buildSentryInitOptions({ dsn: "https://key@o0.ingest.sentry.io/0" });
  assert.ok(fallback);
  assert.equal(fallback.environment, "production");
});

test("buildSentryInitOptions keeps performance tracing off and wires scrubbing", async () => {
  const options = buildSentryInitOptions({ dsn: "https://key@o0.ingest.sentry.io/0" });
  assert.ok(options);
  assert.equal(options.tracesSampleRate, 0);
  assert.equal(typeof options.beforeSend, "function");
  assert.equal(typeof options.beforeBreadcrumb, "function");

  // The wired beforeSend must be the scrubbing filter: a routine wallet
  // rejection becomes null (dropped), a payload-carrying request is stripped.
  assert.equal(
    options.beforeSend({ exception: { values: [{ value: "user declined to sign" }] } }),
    null
  );
  const scrubbed = options.beforeSend({
    request: { headers: { Authorization: "Bearer x" }, cookies: { s: "1" } }
  });
  assert.ok(scrubbed);
  const request = scrubbed.request as Record<string, unknown>;
  assert.equal("cookies" in request, false);
  assert.equal("headers" in request, true);
});

test("buildSentryInitOptions trims a padded DSN", () => {
  const options = buildSentryInitOptions({ dsn: "  https://key@o0.ingest.sentry.io/0 " });
  assert.ok(options);
  assert.equal(options.dsn, "https://key@o0.ingest.sentry.io/0");
});
