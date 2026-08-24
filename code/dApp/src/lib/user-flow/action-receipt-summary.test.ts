import assert from "node:assert/strict";
import { test } from "node:test";
import type { UserActionKind } from "@/components/user/flow-types";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";

// The actions with no receipt branch of their own in workspace-review-receipt.ts. They
// used to fall to a generated summary that lower-cased the label and dropped the article:
// "You are preparing publish certificate." Each now carries a written sentence.
// `wallet-withdraw` was on this list until it got a branch of its own, which supersedes
// the sentence; it is deliberately absent now.
const NEEDS_RECEIPT_SUMMARY: UserActionKind[] = [
  "set-intended-stake-credential",
  "wallet-publish",
  "wallet-vote",
  "renew-proof-of-life",
  "wallet-spend"
];

test("every action without a receipt branch carries a written receipt summary", () => {
  for (const kind of NEEDS_RECEIPT_SUMMARY) {
    const summary = USER_ACTION_DEFINITION_MAP[kind].receiptSummary;
    assert.ok(summary, `${kind} has no receiptSummary`);
    assert.match(summary, /^[A-Z]/, `${kind}: should open with a capital`);
    assert.match(summary, /\.$/, `${kind}: should end as a sentence`);
  }
});

test("no receipt summary is the old lower-cased-label sentence", () => {
  for (const kind of NEEDS_RECEIPT_SUMMARY) {
    const definition = USER_ACTION_DEFINITION_MAP[kind];
    // The exact string the generic branch produces. Regressing to it would read
    // "You are preparing publish certificate." on screen.
    assert.notEqual(
      definition.receiptSummary,
      `You are preparing ${definition.label.toLowerCase()}.`,
      `${kind}: receiptSummary reproduces the generated fallback`
    );
  }
});
