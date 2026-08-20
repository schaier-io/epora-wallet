import assert from "node:assert/strict";
import test from "node:test";
import type { SetupState } from "@/components/user/flow-types";
import { buildSetupReadinessIssues } from "@/lib/user-flow/setup-readiness";

function readyState(): SetupState {
  return {
    walletName: "eternl",
    networkId: 0,
    hasDetectedToken: true,
    sharedSttReferenceStatus: "ready",
    sharedSttReferenceError: null,
    lockingContractAddress: "addr_test1_locking",
    lockingContractError: null,
    lockedUtxoCount: 3,
    lockedUtxosLoading: false
  };
}

function blockedState(): SetupState {
  return {
    walletName: null,
    networkId: null,
    hasDetectedToken: false,
    sharedSttReferenceStatus: "missing",
    sharedSttReferenceError: null,
    lockingContractAddress: null,
    lockingContractError: null,
    lockedUtxoCount: 0,
    lockedUtxosLoading: false
  };
}

/**
 * The label of a checklist row is rendered bold above its description, and both branches of
 * a row share one label. A label written for the ready branch therefore claimed success over
 * a failing row — "Funds loaded" in bold above "No wallet funds are loaded yet". These tests
 * hold the labels to naming the thing and leaving the status to the icon.
 */

test("every checklist label is identical in the ready and the blocked state", () => {
  const ready = buildSetupReadinessIssues(readyState());
  const blocked = buildSetupReadinessIssues(blockedState());

  assert.equal(ready.length, blocked.length);
  for (const [index, issue] of ready.entries()) {
    assert.equal(issue.label, blocked[index]!.label);
  }
});

test("no checklist label asserts an outcome", () => {
  const claimWords = /\b(ready|loaded|opened|done|complete|ok)\b/i;

  for (const state of [readyState(), blockedState()]) {
    for (const issue of buildSetupReadinessIssues(state)) {
      assert.ok(
        !claimWords.test(issue.label),
        `label "${issue.label}" claims a state the row may not be in`
      );
    }
  }
});

test("a blocked checklist reports every row as not ready", () => {
  const issues = buildSetupReadinessIssues(blockedState());
  assert.ok(issues.length > 0);
  assert.ok(issues.every((issue) => issue.status !== "ready"));
});

test("fund pools are counted with a real plural, not a (s) stub", () => {
  const one = buildSetupReadinessIssues({ ...readyState(), lockedUtxoCount: 1 });
  const many = buildSetupReadinessIssues({ ...readyState(), lockedUtxoCount: 4 });

  const describe = (issues: ReturnType<typeof buildSetupReadinessIssues>) =>
    issues.find((issue) => issue.key === "locked-utxos")!.description;

  assert.match(describe(one), /1 fund pool found/);
  assert.match(describe(many), /4 fund pools found/);
  assert.doesNotMatch(describe(many), /\(s\)/);
});
