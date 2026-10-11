import assert from "node:assert/strict";
import test from "node:test";

import type { SentryEventLike } from "./sentry-scrub";
import { scrubSentryEvent } from "./sentry-scrub";
import { isSkippedViewTransition } from "./view-transition-noise-filter";

// The real shape from Sentry issue EPORA-WALLET-K: an unhandled rejection
// with no stack trace, Chrome 154, tab hidden mid-transition on /user.
const OBSERVED_EVENT: SentryEventLike = {
  exception: {
    values: [
      {
        type: "Error",
        value: "InvalidStateError: Transition was aborted because of invalid state. Document hidden"
      }
    ]
  }
};

test("drops the observed EPORA-WALLET-K event shape", () => {
  assert.equal(isSkippedViewTransition(OBSERVED_EVENT), true);
  assert.equal(scrubSentryEvent(structuredClone(OBSERVED_EVENT)), null);
});

test("drops the other skip messages React treats as benign", () => {
  for (const value of [
    "View transition was skipped because document visibility state is hidden.",
    "Skipping view transition because document visibility state has become hidden.",
    "Skipping view transition because viewport size changed.",
    "Transition was aborted because of invalid state"
  ]) {
    const event: SentryEventLike = {
      exception: { values: [{ type: "InvalidStateError", value }] }
    };
    assert.equal(isSkippedViewTransition(event), true, `expected drop: ${value}`);
  }
});

test("keeps unrelated InvalidStateErrors and app errors", () => {
  for (const value of [
    "InvalidStateError: Failed to execute 'transaction' on 'IDBDatabase'",
    "Cannot read properties of undefined (reading 'utxos')",
    "Wrapped: Transition was aborted because of invalid state"
  ]) {
    const event: SentryEventLike = { exception: { values: [{ type: "Error", value }] } };
    assert.equal(isSkippedViewTransition(event), false, `expected keep: ${value}`);
  }
});

test("ignores breadcrumbs that merely mention a skipped transition", () => {
  const event: SentryEventLike = {
    exception: { values: [{ type: "TypeError", value: "boom" }] },
    breadcrumbs: [{ message: "Transition was aborted because of invalid state" }]
  };
  assert.equal(isSkippedViewTransition(event), false);
});
