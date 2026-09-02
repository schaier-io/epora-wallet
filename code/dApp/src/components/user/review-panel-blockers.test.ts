import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBlockers } from "./review-panel-blockers";
import type { ReadinessIssue } from "./flow-types";

function issue(overrides: Partial<ReadinessIssue>): ReadinessIssue {
  return {
    id: "issue",
    label: "Label",
    description: "Description.",
    status: "error",
    blocking: true,
    ...overrides
  };
}

test("the first blocking issue is primary; non-blocking rows never block", () => {
  const summary = summarizeBlockers(
    [
      issue({ id: "ready", label: "Wallet funds", blocking: false }),
      issue({ id: "first", label: "Connected wallet" }),
      issue({ id: "second", label: "Test network" })
    ],
    {}
  );

  assert.equal(summary.primary?.id, "first");
  assert.deepEqual(summary.additional.map((entry) => entry.id), ["second"]);
  assert.deepEqual(summary.fieldErrors, []);
});

test("no blocking issue means no primary and every field error passes through", () => {
  const summary = summarizeBlockers(
    [issue({ id: "ready", blocking: false })],
    { Amount: ["Enter an amount."] }
  );

  assert.equal(summary.primary, null);
  assert.deepEqual(summary.additional, []);
  assert.deepEqual(summary.fieldErrors, [{ key: "Amount", message: "Enter an amount." }]);
});

test("a field error whose label matches a blocking issue is not shown twice", () => {
  const summary = summarizeBlockers(
    [issue({ id: "blocker", label: "Amount" })],
    { Amount: ["Enter an amount."], "Pays to": ["Enter an address."] }
  );

  assert.deepEqual(summary.fieldErrors, [{ key: "Pays to", message: "Enter an address." }]);
});

test("label matching ignores case and surrounding whitespace", () => {
  const summary = summarizeBlockers(
    [issue({ id: "blocker", label: "  amount " })],
    { " Amount ": ["Enter an amount."] }
  );

  assert.deepEqual(summary.fieldErrors, []);
});

test("the collapsed list says the same blocker once, not once per source", () => {
  const summary = summarizeBlockers(
    [
      issue({ id: "prereq", label: "Wallet funds", description: "No wallet funds are loaded yet." }),
      issue({ id: "field", label: "Wallet funds", description: "No wallet funds are loaded yet." }),
      issue({ id: "other", label: "Test network", description: "The connected wallet is on Mainnet." })
    ],
    {}
  );

  assert.equal(summary.primary?.id, "prereq");
  assert.deepEqual(summary.additional.map((entry) => entry.id), ["other"]);
});

test("an empty review has empty everything", () => {
  const summary = summarizeBlockers([], {});

  assert.equal(summary.primary, null);
  assert.deepEqual(summary.additional, []);
  assert.deepEqual(summary.fieldErrors, []);
});
