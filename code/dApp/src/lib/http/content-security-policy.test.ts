import assert from "node:assert/strict";
import test from "node:test";
import { buildContentSecurityPolicy } from "./content-security-policy";

test("production CSP allows inline scripts only through a request nonce, and WebAssembly", () => {
  const policy = buildContentSecurityPolicy("request-nonce", false);
  const scriptDirective = policy.split("; ").find((directive) => directive.startsWith("script-src"));

  assert.equal(scriptDirective, "script-src 'self' 'nonce-request-nonce' 'wasm-unsafe-eval'");
  assert.doesNotMatch(scriptDirective ?? "", /unsafe-inline|'unsafe-eval'/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("development CSP permits eval for Next diagnostics but still rejects inline scripts", () => {
  const policy = buildContentSecurityPolicy("dev-nonce", true);
  const scriptDirective = policy.split("; ").find((directive) => directive.startsWith("script-src"));

  assert.equal(scriptDirective, "script-src 'self' 'nonce-dev-nonce' 'wasm-unsafe-eval' 'unsafe-eval'");
  assert.doesNotMatch(scriptDirective ?? "", /unsafe-inline/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("connect-src excludes Sentry ingest while browser reporting is unconfigured", () => {
  const policy = buildContentSecurityPolicy("nonce", false);
  assert.doesNotMatch(policy, /ingest\.sentry\.io/);
});

test("connect-src allows Sentry ingest only when browser reporting is enabled", () => {
  const policy = buildContentSecurityPolicy("nonce", false, { sentryEnabled: true });
  const connectDirective = policy.split("; ").find((directive) => directive.startsWith("connect-src"));

  assert.match(policy, /https:\/\/\*\.ingest\.sentry\.io/);
  // Regional ingest hosts (o123.ingest.us.sentry.io) need their own pattern:
  // a CSP host wildcard matches exactly one leading label.
  assert.match(policy, /https:\/\/\*\.ingest\.us\.sentry\.io/);
  assert.match(connectDirective ?? "", /walletconnect/);
});
