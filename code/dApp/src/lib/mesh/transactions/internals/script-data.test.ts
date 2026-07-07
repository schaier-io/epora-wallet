import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTxSizeSummary,
  extractComputedScriptIntegrity,
  formatByteCount,
  isLikelyTransactionCbor,
  normalizeCostModelList,
  plutusScriptSizeBytes,
  resolveRawCostModelList
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

test("isLikelyTransactionCbor accepts a CBOR array and rejects a map or junk", () => {
  // A Cardano tx is a CBOR array (major type 4); 0x84 = 4-element array.
  assert.equal(isLikelyTransactionCbor("84a400818258"), true);
  assert.equal(isLikelyTransactionCbor("a0"), false); // 0xa0 = empty map (major type 5)
  assert.equal(isLikelyTransactionCbor("00"), false);
  assert.equal(isLikelyTransactionCbor("zz"), false); // non-hex -> no major type
});

// Blockfrost has shipped cost models under several key spellings and as both
// arrays and objects; resolveRawCostModelList/normalizeCostModelList absorb that
// drift. A regression here breaks the live script-data-hash refresh on submit.

test("normalizeCostModelList coerces numbers, numeric strings, arrays, and record values", () => {
  assert.deepEqual(normalizeCostModelList([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(normalizeCostModelList(["1", "2"]), [1, 2]);
  assert.deepEqual(normalizeCostModelList({ a: 1, b: 2 }), [1, 2]);
});

test("normalizeCostModelList returns null when any entry is non-numeric", () => {
  assert.equal(normalizeCostModelList([1, "x"]), null);
  assert.equal(normalizeCostModelList([1, ""]), null);
  assert.equal(normalizeCostModelList("not-a-list"), null);
  assert.equal(normalizeCostModelList(null), null);
});

test("resolveRawCostModelList finds a model across key spellings and container preference", () => {
  assert.deepEqual(
    resolveRawCostModelList({ cost_models_raw: { PlutusV2: [1, 2, 3] } }, "PlutusV2"),
    [1, 2, 3]
  );
  // snake_case spelling under cost_models
  assert.deepEqual(
    resolveRawCostModelList({ cost_models: { plutus_v2: [5, 6] } }, "PlutusV2"),
    [5, 6]
  );
  // cost_models_raw wins over cost_models
  assert.deepEqual(
    resolveRawCostModelList(
      { cost_models_raw: { PlutusV3: [9] }, cost_models: { PlutusV3: [8] } },
      "PlutusV3"
    ),
    [9]
  );
  assert.equal(resolveRawCostModelList({}, "PlutusV1"), null);
});
