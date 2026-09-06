import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBlockers } from "./review-panel-blockers";
import type { ReadinessIssue } from "./flow-types";
import { FIELD_ERROR_KEYS } from "@/components/user/field-error-keys";

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
  assert.deepEqual(summary.fieldErrors, [
    { key: "Amount", label: "Amount", message: "Enter an amount." }
  ]);
});

test("a field error whose label matches a blocking issue is not shown twice", () => {
  const summary = summarizeBlockers(
    [issue({ id: "blocker", label: "Amount" })],
    { Amount: ["Enter an amount."], "Pays to": ["Enter an address."] }
  );

  assert.deepEqual(summary.fieldErrors, [
    { key: "Pays to", label: "Pays to", message: "Enter an address." }
  ]);
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

// The tests above use keys `describeFieldErrorKey` does not know, so they take its identity
// fallback and `key === label` by construction. That cannot tell the render boundary apart
// from the pre-refactor behaviour of showing the reader the key itself. These two use a real
// slug, where the identity and the label differ.
test("a real field-error key reaches the reader as its label, not its slug", () => {
  const summary = summarizeBlockers([], { "output-state": ["Only the owner path can rename."] });

  assert.deepEqual(summary.fieldErrors, [
    {
      key: FIELD_ERROR_KEYS.outputState,
      label: "Wallet state after",
      message: "Only the owner path can rename."
    }
  ]);
});

test("dedupe against a blocking issue matches the label, not the slug", () => {
  // The readiness rail labels its issue in reader copy. The field error arrives under a slug.
  // They are the same blocker, so the reader has to be told once.
  const summary = summarizeBlockers([issue({ id: "blocker", label: "Wallet state after" })], {
    "output-state": ["Only the owner path can rename."],
    [FIELD_ERROR_KEYS.payouts]: ["No payout is staged yet."]
  });

  assert.deepEqual(summary.fieldErrors, [
    { key: "payouts", label: "Payouts", message: "No payout is staged yet." }
  ]);
});
