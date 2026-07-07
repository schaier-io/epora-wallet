import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReferenceScriptDiagnostics,
  describeReferenceScriptUsage,
  excludeReservedUtxos,
  hasReferenceScript,
  parseReferenceUtxoConfig,
  resolveMintReferenceInput,
  type ReferenceScriptResolution
} from "@/lib/mesh/transactions/internals/reference-scripts";
import { type UTxO } from "@meshsdk/core";

const A = "a".repeat(64);
const B = "b".repeat(64);

function makeUtxo(
  txHash: string,
  outputIndex: number,
  opts: { scriptRef?: string; scriptHash?: string } = {}
): UTxO {
  return {
    input: { txHash, outputIndex },
    output: {
      address: "addr_test1qexample",
      amount: [{ unit: "lovelace", quantity: "1000000" }],
      ...(opts.scriptRef !== undefined ? { scriptRef: opts.scriptRef } : {}),
      ...(opts.scriptHash !== undefined ? { scriptHash: opts.scriptHash } : {})
    }
  } as UTxO;
}

test("hasReferenceScript is true only for a non-empty scriptRef string", () => {
  assert.equal(hasReferenceScript(makeUtxo(A, 0, { scriptRef: "abcd" })), true);
  assert.equal(hasReferenceScript(makeUtxo(A, 0)), false);
  assert.equal(hasReferenceScript(makeUtxo(A, 0, { scriptRef: "" })), false);
});

test("excludeReservedUtxos drops reserved refs and is identity for an empty set", () => {
  const utxos = [makeUtxo(A, 0), makeUtxo(B, 1)];
  assert.deepEqual(excludeReservedUtxos(utxos, new Set([`${A}#0`])), [makeUtxo(B, 1)]);
  assert.equal(excludeReservedUtxos(utxos, new Set()), utxos);
});

test("buildReferenceScriptDiagnostics separates inline scripts from reference witnesses", () => {
  const diagnostics = buildReferenceScriptDiagnostics([
    { label: "stt", script: { code: "abcd" } }, // 2 bytes, inline
    {
      label: "wallet",
      script: { code: "abcdef" }, // 3 bytes, served by reference
      reference: {
        reference: "ref#0",
        source: "shared-stt-reference-store",
        validation: "hash-verified"
      } as ReferenceScriptResolution
    }
  ]);

  assert.equal(diagnostics.referenceScriptCount, 1);
  assert.equal(diagnostics.inlineScripts.length, 1);
  assert.equal(diagnostics.inlineScriptTotalBytes, 2);
  assert.equal(diagnostics.exceedsMaxTxSize, false);
  assert.equal(diagnostics.scriptWitnesses[1]!.witness, "reference");
  assert.equal(diagnostics.scriptWitnesses[1]!.reference, "ref#0");
});

test("describeReferenceScriptUsage pluralizes the reference-script count", () => {
  const withRefs = (count: number) =>
    buildReferenceScriptDiagnostics(
      Array.from({ length: count + 1 }, (_unused, index) => ({
        label: `s${index}`,
        script: { code: "ab" },
        // first script inline, the rest served via reference
        reference:
          index === 0
            ? undefined
            : ({ reference: `r${index}`, source: "x", validation: "hash-verified" } as ReferenceScriptResolution)
      }))
    );

  assert.equal(describeReferenceScriptUsage(withRefs(0)), "");
  assert.equal(describeReferenceScriptUsage(withRefs(1)), " using 1 reference script");
  assert.equal(describeReferenceScriptUsage(withRefs(2)), " using 2 reference scripts");
});

test("resolveMintReferenceInput uses a selected spendable UTxO", () => {
  const result = resolveMintReferenceInput(
    [makeUtxo(A, 0)],
    [makeUtxo(A, 0)],
    { txHash: A, outputIndex: 0 }
  );
  assert.deepEqual(result, {
    utxo: makeUtxo(A, 0),
    reference: `${A}#0`,
    source: "selected-reference-utxo"
  });
});

test("resolveMintReferenceInput rejects a selected UTxO that carries a reference script", () => {
  assert.throws(
    () =>
      resolveMintReferenceInput(
        [makeUtxo(A, 0, { scriptRef: "abcd" })],
        [], // not spendable
        { txHash: A, outputIndex: 0 }
      ),
    /contains a reference script/
  );
});

test("resolveMintReferenceInput rejects a selection absent from spendable UTxOs", () => {
  assert.throws(
    () => resolveMintReferenceInput([], [], { txHash: A, outputIndex: 0 }),
    /was not found among the connected wallet's spendable UTxOs/
  );
});

test("resolveMintReferenceInput falls back to the first spendable UTxO", () => {
  const result = resolveMintReferenceInput([makeUtxo(B, 2)], [makeUtxo(B, 2)]);
  assert.deepEqual(result, {
    utxo: makeUtxo(B, 2),
    reference: `${B}#2`,
    source: "wallet-first-spendable-utxo"
  });
});

test("resolveMintReferenceInput throws when there are no spendable UTxOs", () => {
  assert.throws(
    () => resolveMintReferenceInput([], []),
    /No wallet UTxOs available for mint reference selection/
  );
});

test("parseReferenceUtxoConfig parses both separators and rejects bad formats", () => {
  assert.equal(parseReferenceUtxoConfig(undefined, "Ref"), null);
  assert.equal(parseReferenceUtxoConfig("   ", "Ref"), null);
  assert.deepEqual(parseReferenceUtxoConfig(`${A}#3`, "Ref"), { txHash: A, outputIndex: 3 });
  assert.deepEqual(parseReferenceUtxoConfig(`${A.toUpperCase()}:7`, "Ref"), {
    txHash: A,
    outputIndex: 7
  });
  assert.throws(() => parseReferenceUtxoConfig("not-a-ref", "Ref"), /must use the format txHash#index/);
});
