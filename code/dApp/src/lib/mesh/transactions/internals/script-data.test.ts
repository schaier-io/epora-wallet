import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTxSizeSummary,
  extractComputedScriptIntegrity,
  formatByteCount,
  plutusScriptSizeBytes
} from "@/lib/mesh/transactions/internals/script-data";

const HASH = "a".repeat(64);

// extractComputedScriptIntegrity scrapes the expected script-data hash out of a
// cardano-node submission error — a best-effort recovery whose two regexes
// depend on un-versioned node wording, so they're worth pinning.

test("extractComputedScriptIntegrity reads the computedScriptIntegrity JSON field", () => {
  assert.equal(
    extractComputedScriptIntegrity(`submit failed {"computedScriptIntegrity":"${HASH}"} trailing`),
    HASH
  );
});

test("extractComputedScriptIntegrity reads the SafeHash 'expected' form", () => {
  assert.equal(
    extractComputedScriptIntegrity(`Mismatch expected: SJust (SafeHash "${HASH}") actual: SNothing`),
    HASH
  );
});

test("extractComputedScriptIntegrity unescapes embedded quotes and reads Error messages", () => {
  assert.equal(
    extractComputedScriptIntegrity(new Error(`{\\"computedScriptIntegrity\\":\\"${HASH}\\"}`)),
    HASH
  );
});

test("extractComputedScriptIntegrity returns null when no hash is present", () => {
  assert.equal(extractComputedScriptIntegrity(new Error("some unrelated submission failure")), null);
  assert.equal(extractComputedScriptIntegrity("plain text, no hash"), null);
});

test("plutusScriptSizeBytes counts hex code as bytes", () => {
  assert.equal(plutusScriptSizeBytes({ code: "abcd" }), 2);
  assert.equal(plutusScriptSizeBytes({ code: "" }), 0);
});

test("formatByteCount groups thousands", () => {
  assert.equal(formatByteCount(1234), "1,234");
});

test("buildTxSizeSummary reports used bytes against the protocol max", () => {
  const summary = buildTxSizeSummary("ab".repeat(100)); // 100 bytes
  assert.equal(summary.usedBytes, 100);
  assert.equal(summary.maxBytes, 16_384);
});
