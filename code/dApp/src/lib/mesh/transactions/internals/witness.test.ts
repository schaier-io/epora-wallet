import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildGovernanceScriptSource,
  createMeshRedeemer
} from "@/lib/mesh/transactions/internals/witness";
import { type ReferenceScriptResolution } from "@/lib/mesh/transactions/internals/reference-scripts";
import { DEFAULT_REDEEMER_BUDGET } from "@meshsdk/common";

const reference = {
  utxo: { input: { txHash: "a".repeat(64), outputIndex: 2 } },
  scriptHash: "deadbeef",
  scriptSize: "1234"
} as unknown as ReferenceScriptResolution;

test("buildGovernanceScriptSource yields an Inline reference source when a reference script is given", () => {
  assert.deepEqual(buildGovernanceScriptSource({ code: "abcd", version: "V3" }, reference), {
    type: "Inline",
    txHash: "a".repeat(64),
    txIndex: 2,
    scriptHash: "deadbeef",
    scriptSize: "1234",
    version: "V3"
  });
});

test("buildGovernanceScriptSource falls back to a Provided inline script when there is no reference", () => {
  const script = { code: "abcd", version: "V3" as const };
  assert.deepEqual(buildGovernanceScriptSource(script, null), {
    type: "Provided",
    script
  });
});

test("createMeshRedeemer wraps the datum and applies the default redeemer budget", () => {
  const data = { alternative: 1, fields: [42] };
  assert.deepEqual(createMeshRedeemer(data), {
    data: { type: "Mesh", content: data },
    exUnits: { mem: DEFAULT_REDEEMER_BUDGET.mem, steps: DEFAULT_REDEEMER_BUDGET.steps }
  });
});
