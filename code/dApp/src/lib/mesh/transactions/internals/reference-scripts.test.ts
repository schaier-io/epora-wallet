import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReferenceScriptDiagnostics,
  describeReferenceScriptUsage,
  excludeReservedUtxos,
  hasReferenceScript,
  resolveMintReferenceInput,
  type ReferenceScriptResolution
} from "./reference-scripts";
import { CARDANO_MAX_TX_SIZE_BYTES } from "./constants";
import { type UTxO } from "@meshsdk/core";

function utxo(txHash: string, outputIndex: number, scriptRef?: string): UTxO {
  return {
    input: { txHash, outputIndex },
    output: {
      address: "addr_test1qq",
      amount: [{ unit: "lovelace", quantity: "2000000" }],
      ...(scriptRef ? { scriptRef } : {})
    }
  };
}

test("hasReferenceScript is true only for a non-empty scriptRef string", () => {
  assert.equal(hasReferenceScript(utxo("aa".repeat(32), 0, "abcd")), true);
  assert.equal(hasReferenceScript(utxo("aa".repeat(32), 0, "")), false);
  assert.equal(hasReferenceScript(utxo("aa".repeat(32), 0)), false);
});

test("excludeReservedUtxos returns the input untouched when nothing is reserved", () => {
  const utxos = [utxo("aa".repeat(32), 0), utxo("bb".repeat(32), 1)];
  assert.equal(excludeReservedUtxos(utxos, new Set()), utxos);
});

test("excludeReservedUtxos drops utxos whose ref key is reserved", () => {
  const a = utxo("aa".repeat(32), 0);
  const b = utxo("bb".repeat(32), 1);
  const c = utxo("cc".repeat(32), 2);
  const reserved = new Set([`${"bb".repeat(32)}#1`]);
  assert.deepEqual(excludeReservedUtxos([a, b, c], reserved), [a, c]);
});

test("describeReferenceScriptUsage renders count with correct pluralization", () => {
  const make = (count: number) =>
    ({
      referenceScriptCount: count
    }) as Parameters<typeof describeReferenceScriptUsage>[0];
  assert.equal(describeReferenceScriptUsage(make(0)), "");
  assert.equal(describeReferenceScriptUsage(make(1)), " using 1 reference script");
  assert.equal(describeReferenceScriptUsage(make(3)), " using 3 reference scripts");
});

test("buildReferenceScriptDiagnostics classifies inline vs reference scripts and sums inline bytes", () => {
  const reference: ReferenceScriptResolution = {
    utxo: utxo("dd".repeat(32), 0, "ref"),
    reference: `${"dd".repeat(32)}#0`,
    source: "shared-stt-reference-store",
    scriptHash: "hash",
    scriptSize: "10",
    validation: "hash-verified"
  };
  const diagnostics = buildReferenceScriptDiagnostics([
    { label: "stt", script: { code: "abcd" }, reference }, // 2 bytes, routed to reference
    { label: "wallet", script: { code: "abcdef" } }, // 3 bytes, inline
    { label: "gov", script: { code: "ab" } } // 1 byte, inline
  ]);

  assert.equal(diagnostics.scriptWitnesses.length, 3);
  assert.equal(diagnostics.referenceScriptCount, 1);
  assert.equal(diagnostics.inlineScripts.length, 2);
  // plutusScriptSizeBytes = ceil(code.length / 2): 3 + 1 = 4
  assert.equal(diagnostics.inlineScriptTotalBytes, 4);
  assert.equal(diagnostics.maxTxSizeBytes, CARDANO_MAX_TX_SIZE_BYTES);
  assert.equal(diagnostics.exceedsMaxTxSize, false);

  const sttWitness = diagnostics.scriptWitnesses.find((entry) => entry.label === "stt");
  assert.equal(sttWitness?.witness, "reference");
  assert.equal(sttWitness?.reference, reference.reference);
  assert.equal(sttWitness?.validation, "hash-verified");

  const walletWitness = diagnostics.scriptWitnesses.find((entry) => entry.label === "wallet");
  assert.equal(walletWitness?.witness, "inline");
  assert.equal(walletWitness?.reference, undefined);

  assert.match(diagnostics.inlineScriptSummary, /wallet 3 B/);
  assert.match(diagnostics.inlineScriptSummary, /gov 1 B/);
});

test("buildReferenceScriptDiagnostics flags an inline total that exceeds the max tx size", () => {
  const oversizedCode = "a".repeat((CARDANO_MAX_TX_SIZE_BYTES + 10) * 2); // > max bytes inline
  const diagnostics = buildReferenceScriptDiagnostics([
    { label: "huge", script: { code: oversizedCode } }
  ]);
  assert.equal(diagnostics.exceedsMaxTxSize, true);
  assert.equal(diagnostics.referenceScriptCount, 0);
  assert.equal(diagnostics.inlineScriptTotalBytes, CARDANO_MAX_TX_SIZE_BYTES + 10);
});

test("resolveMintReferenceInput falls back to the first spendable wallet utxo", () => {
  const first = utxo("aa".repeat(32), 0);
  const second = utxo("bb".repeat(32), 1);
  const result = resolveMintReferenceInput([first, second], [first, second]);
  assert.equal(result.source, "wallet-first-spendable-utxo");
  assert.equal(result.utxo, first);
  assert.equal(result.reference, `${"aa".repeat(32)}#0`);
});

test("resolveMintReferenceInput throws when there are no spendable wallet utxos", () => {
  assert.throws(
    () => resolveMintReferenceInput([], []),
    /No wallet UTxOs available for mint reference selection/
  );
});

test("resolveMintReferenceInput returns the selected spendable utxo when it matches", () => {
  const target = utxo("cc".repeat(32), 4);
  const other = utxo("aa".repeat(32), 0);
  const result = resolveMintReferenceInput([other, target], [other, target], {
    txHash: "cc".repeat(32),
    outputIndex: 4
  });
  assert.equal(result.source, "selected-reference-utxo");
  assert.equal(result.utxo, target);
  assert.equal(result.reference, `${"cc".repeat(32)}#4`);
});

test("resolveMintReferenceInput rejects a selected utxo that carries a reference script", () => {
  const scripted = utxo("cc".repeat(32), 4, "abcd"); // has a reference script
  assert.throws(
    () =>
      resolveMintReferenceInput([scripted], [], {
        txHash: "cc".repeat(32),
        outputIndex: 4
      }),
    /contains a reference script and cannot be consumed as the mint reference input/
  );
});

test("resolveMintReferenceInput reports a selection that is not among spendable utxos", () => {
  const walletOnly = utxo("cc".repeat(32), 4); // present in wallet, not spendable, no ref script
  assert.throws(
    () =>
      resolveMintReferenceInput([walletOnly], [], {
        txHash: "cc".repeat(32),
        outputIndex: 4
      }),
    /was not found among the connected wallet's spendable UTxOs/
  );
});
