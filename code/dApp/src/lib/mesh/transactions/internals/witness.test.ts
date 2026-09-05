import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyWithdrawalWitness,
  buildGovernanceScriptSource,
  createMeshRedeemer
} from "@/lib/mesh/transactions/internals/witness";
import { type RuntimeTxBuilder } from "@/lib/mesh/transactions/internals/budget-runtime-builder";
import { type ReferenceScriptResolution } from "@/lib/mesh/transactions/internals/reference-scripts";
import { DEFAULT_REDEEMER_BUDGET } from "@meshsdk/common";
import { MeshTxBuilder } from "@meshsdk/core";

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

test("createMeshRedeemer preserves an evaluated budget override", () => {
  const data = { alternative: 0, fields: [] };
  assert.deepEqual(createMeshRedeemer(data, { mem: 123, steps: 456 }), {
    data: { type: "Mesh", content: data },
    exUnits: { mem: 123, steps: 456 }
  });
});

// A real preprod reward address: Mesh parses it when it records the withdrawal.
const REWARD_ADDRESS = "stake_test1uqevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqp8n5xl";
const WITHDRAW_SCRIPT = { code: "4e4d01000033222220051200120011", version: "V3" as const };

// Mesh holds the last withdrawal as a pending item until the next builder call
// or complete(); flush it the way complete() does so the body can be read.
function queuedWithdrawals(builder: MeshTxBuilder) {
  (builder as unknown as { queueAllLastItem(): void }).queueAllLastItem();
  return builder.meshTxBuilderBody.withdrawals;
}

// Mesh types a withdrawal by what precedes it. Adding the withdrawal before the
// PlutusV3 marker made it a pub-key withdrawal, and the reference script and
// redeemer then threw "Adding script reference to pub key withdrawal".
test("applyWithdrawalWitness records a script withdrawal with a reference script", () => {
  const builder = new MeshTxBuilder({});
  applyWithdrawalWitness(
    builder as unknown as RuntimeTxBuilder,
    REWARD_ADDRESS,
    "1000000",
    WITHDRAW_SCRIPT,
    {
      ...reference,
      scriptHash: "b".repeat(56),
      utxo: { input: { txHash: "a".repeat(64), outputIndex: 0 } }
    } as unknown as ReferenceScriptResolution,
    { alternative: 0, fields: [] }
  );
  const withdrawal = queuedWithdrawals(builder)[0]!;
  assert.equal(withdrawal.type, "ScriptWithdrawal");
  assert.equal(withdrawal.address, REWARD_ADDRESS);
  assert.equal(withdrawal.coin, "1000000");
  assert.equal(builder.meshTxBuilderBody.withdrawals.length, 1);
});

test("applyWithdrawalWitness records a script withdrawal with an inline script", () => {
  const builder = new MeshTxBuilder({});
  applyWithdrawalWitness(
    builder as unknown as RuntimeTxBuilder,
    REWARD_ADDRESS,
    "1000000",
    WITHDRAW_SCRIPT,
    null,
    { alternative: 0, fields: [] }
  );
  const withdrawal = queuedWithdrawals(builder)[0]!;
  assert.equal(withdrawal.type, "ScriptWithdrawal");
  assert.equal(builder.meshTxBuilderBody.withdrawals.length, 1);
});
