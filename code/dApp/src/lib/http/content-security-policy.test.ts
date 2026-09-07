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
