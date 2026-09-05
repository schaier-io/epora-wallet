import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertExecutionUnitsWithinTransactionLimits,
  createEmptyExecutionValidatorLabels,
  extractExecutionSnapshot,
  summarizeUsageByValidator
} from "@/lib/mesh/transactions/internals/execution-snapshot";
import { type ExecutionUnitsSummary } from "@/lib/types/contracts";
import { type Transaction } from "@meshsdk/core";

const A = "a".repeat(64);
const EXECUTION_SUMMARY_AT_LIMIT = {
  memUsed: "14000000",
  stepsUsed: "10000000000",
  maxTxMem: "14000000",
  maxTxSteps: "10000000000",
  maxBlockMem: "62000000",
  maxBlockSteps: "40000000000",
  redeemers: [],
  perValidator: []
} satisfies ExecutionUnitsSummary;

test("createEmptyExecutionValidatorLabels returns empty label collections", () => {
  const labels = createEmptyExecutionValidatorLabels();
  assert.deepEqual(labels.certificateValidators, []);
  assert.deepEqual(labels.mintValidators, []);
  assert.deepEqual(labels.rewardValidators, []);
  assert.equal(labels.spendValidatorsByRef.size, 0);
  assert.deepEqual(labels.voteValidators, []);
});

// summarizeUsageByValidator rolls per-redeemer usage up per validator, sorted by
// steps desc then name; this drives the execution-units display, so the grouping
// and ordering are pinned.
test("summarizeUsageByValidator sums per validator and sorts by steps then name", () => {
  const summary = summarizeUsageByValidator([
    { tag: "SPEND", index: 0, mem: "10", steps: "100", validator: "v1" },
    { tag: "MINT", index: 0, mem: "5", steps: "50", validator: "v1" },
    { tag: "SPEND", index: 1, mem: "1", steps: "500", validator: "v2" },
    { tag: "REWARD", index: 0, mem: "2", steps: "20" } // no validator -> "unknown"
  ]);

  assert.deepEqual(summary, [
    { validator: "v2", memUsed: "1", stepsUsed: "500", redeemerCount: 1 },
    { validator: "v1", memUsed: "15", stepsUsed: "150", redeemerCount: 2 },
    { validator: "unknown", memUsed: "2", stepsUsed: "20", redeemerCount: 1 }
  ]);
});

test("extractExecutionSnapshot collects spend/mint/reward budgets and totals", () => {
  const tx = {
    txBuilder: {
      _protocolParams: {
        maxTxExMem: 1000,
        maxTxExSteps: 2000,
        maxBlockExMem: 3000,
        maxBlockExSteps: 4000
      },
      meshTxBuilderBody: {
        inputs: [
          {
            type: "Script",
            txIn: { txHash: A, txIndex: 0 },
            scriptTxIn: { redeemer: { exUnits: { mem: 10, steps: 100 } } }
          }
        ],
        mints: [
          { type: "Plutus", policyId: "pid", assetName: "an", redeemer: { exUnits: { mem: 5, steps: 50 } } }
        ],
        withdrawals: [
          { type: "ScriptWithdrawal", address: "stake_test1xyz", redeemer: { exUnits: { mem: 2, steps: 20 } } }
        ],
        certificates: [
          {
            type: "ScriptCertificate",
            certType: { type: "RegisterStake", stakeKeyAddress: "stake_test1xyz" },
            redeemer: { exUnits: { mem: 3, steps: 30 } }
          }
        ],
        votes: [
          {
            type: "ScriptVote",
            vote: {
              voter: { type: "DRep", drepId: "drep1xyz" },
              govActionId: { txHash: A, txIndex: 0 },
              votingProcedure: { voteKind: "Yes" }
            },
            redeemer: { exUnits: { mem: 4, steps: 40 } }
          }
        ]
      }
    }
  } as unknown as Transaction;

  const snapshot = extractExecutionSnapshot(tx);

  assert.deepEqual(snapshot.overrides.spendBudgetsByRef.get(`${A}#0`), { mem: 10, steps: 100 });
  assert.deepEqual(snapshot.overrides.mintBudgets, [{ mem: 5, steps: 50 }]);
  assert.deepEqual(snapshot.overrides.rewardBudgets, [{ mem: 2, steps: 20 }]);
  assert.deepEqual(snapshot.overrides.certificateBudgets, [{ mem: 3, steps: 30 }]);
  assert.deepEqual(snapshot.overrides.voteBudgets, [{ mem: 4, steps: 40 }]);
  assert.equal(snapshot.summary.memUsed, "24");
  assert.equal(snapshot.summary.stepsUsed, "240");
  assert.equal(snapshot.summary.maxTxMem, "1000");
  assert.deepEqual(snapshot.summary.redeemers.map(({ tag }) => tag), [
    "SPEND",
    "MINT",
    "REWARD",
    "CERT",
    "VOTE"
  ]);
});

test("extractExecutionSnapshot ignores non-script inputs and zero-protocol-params gracefully", () => {
  const tx = {
    txBuilder: {
      meshTxBuilderBody: {
        inputs: [{ type: "PubKey", txIn: { txHash: A, txIndex: 0 } }]
      }
    }
  } as unknown as Transaction;

  const snapshot = extractExecutionSnapshot(tx);
  assert.equal(snapshot.overrides.spendBudgetsByRef.size, 0);
  assert.equal(snapshot.summary.memUsed, "0");
  assert.equal(snapshot.summary.maxTxMem, "0"); // missing _protocolParams -> "0" fallback
});

test("accepts combined execution units at the transaction limits", () => {
  assert.doesNotThrow(() =>
    assertExecutionUnitsWithinTransactionLimits(EXECUTION_SUMMARY_AT_LIMIT)
  );
});

test("rejects combined memory or CPU above the transaction limits", () => {
  assert.throws(
    () =>
      assertExecutionUnitsWithinTransactionLimits({
        ...EXECUTION_SUMMARY_AT_LIMIT,
        memUsed: "14000001"
      }),
    /uses 14000001 memory units.*limit is 14000000/
  );
  assert.throws(
    () =>
      assertExecutionUnitsWithinTransactionLimits({
        ...EXECUTION_SUMMARY_AT_LIMIT,
        stepsUsed: "10000000001"
      }),
    /uses 10000000001 CPU units.*limit is 10000000000/
  );
});

test("rejects script execution when protocol limits are missing", () => {
  assert.throws(
    () =>
      assertExecutionUnitsWithinTransactionLimits({
        ...EXECUTION_SUMMARY_AT_LIMIT,
        memUsed: "1",
        maxTxMem: "0"
      }),
    /Cannot verify transaction memory use.*protocol limit is missing/
  );
});
