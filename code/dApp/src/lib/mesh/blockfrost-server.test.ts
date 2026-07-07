import assert from "node:assert/strict";
import test from "node:test";

import type { BlockfrostProvider } from "@meshsdk/core";

import { executeMeshMethod } from "./blockfrost-server";

// Records `get` calls without touching the network; validation must throw
// BEFORE the provider is invoked on every rejected path.
function stubProvider(calls: string[]): BlockfrostProvider {
  return {
    get: async (url: string) => {
      calls.push(url);
      return { ok: true };
    },
  } as unknown as BlockfrostProvider;
}

test("get accepts a plain relative Blockfrost path", async () => {
  const calls: string[] = [];
  await executeMeshMethod(stubProvider(calls), "get", ["/pools/pool1abc"]);
  assert.deepEqual(calls, ["/pools/pool1abc"]);
});

test("get rejects absolute, scheme-prefixed, protocol-relative, backslash and traversal paths", async () => {
  const malicious = [
    "https://evil.example/steal",
    "http:169.254.169.254/latest/meta-data", // scheme without slashes still parses as absolute
    "HTTPS:evil.example",
    "foo+bar.v1:whatever",
    "//evil.example/path",
    "/pools/../../admin",
    "\\\\evil.example\\share",
    // Percent-encoded payloads: literal (not pre-decoded by the test) so the
    // guard's own decode step is what must catch them.
    "%2e%2e/admin", // -> "../admin"
    "..%2f..%2fsecret", // -> "../../secret"
    "%2f%2fevil.example/path", // -> "//evil.example/path"
    "%68%74%74%70%3a%2f%2fevil.example", // -> "http://evil.example"
    "%2e%2e%2fadmin", // -> "../admin"
  ];
  for (const path of malicious) {
    const calls: string[] = [];
    await assert.rejects(
      executeMeshMethod(stubProvider(calls), "get", [path]),
      /relative Blockfrost path/,
      `should reject: ${path}`
    );
    assert.deepEqual(calls, [], `provider must not be called for: ${path}`);
  }
});
