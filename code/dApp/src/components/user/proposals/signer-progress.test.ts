import { test } from "node:test";
import assert from "node:assert/strict";

import {
  authorityPathLabel,
  countOutstandingSigners,
  describeSignerProgress
} from "./signer-progress";
import type { SignerSatisfaction } from "@/lib/proposals/types";

function satisfaction(overrides: Partial<SignerSatisfaction> = {}): SignerSatisfaction {
  return {
    authorityPath: "multisig",
    requiredSigners: [
      { keyHash: "a".repeat(56), power: 2, isAdmin: false },
      { keyHash: "b".repeat(56), power: 2, isAdmin: false },
      { keyHash: "c".repeat(56), power: 1, isAdmin: false }
    ],
    signedKeyHashes: ["a".repeat(56)],
    satisfiedPower: 2,
    threshold: 3,
    satisfied: false,
    ...overrides
  };
}

/**
 * The list row said "3 signed": a count with no total, so a finished request and one still
 * waiting looked the same. These hold the sentence that replaced it.
 */
test("a multisig request counts power against the threshold", () => {
  const progress = describeSignerProgress(satisfaction(), 1);
  assert.equal(progress.label, "2 of 3 approval power");
  assert.equal(progress.tone, "pending");
});

test("a satisfied multisig request reads as ready", () => {
  const progress = describeSignerProgress(
    satisfaction({ satisfiedPower: 4, satisfied: true }),
    2
  );
  assert.equal(progress.label, "4 of 3 approval power");
  assert.equal(progress.tone, "ready");
});

test("the owner path has no threshold, so it says who it is waiting for", () => {
  const waiting = describeSignerProgress(
    satisfaction({ authorityPath: "admin", threshold: null, satisfied: false }),
    0
  );
  assert.deepEqual(waiting, { label: "Waiting for an owner", tone: "pending" });

  const done = describeSignerProgress(
    satisfaction({ authorityPath: "admin", threshold: null, satisfied: true }),
    1
  );
  assert.deepEqual(done, { label: "Signed by an owner", tone: "ready" });
});

test("before verification lands it reports the count it has, not a total it cannot see", () => {
  assert.deepEqual(describeSignerProgress(null, 0), { label: "0 signatures", tone: "pending" });
  assert.deepEqual(describeSignerProgress(null, 1), { label: "1 signature", tone: "pending" });
  assert.deepEqual(describeSignerProgress(undefined, 3), {
    label: "3 signatures",
    tone: "pending"
  });
});

test("outstanding signers counts the required people who have not signed", () => {
  assert.equal(countOutstandingSigners(satisfaction()), 2);
  assert.equal(
    countOutstandingSigners(
      satisfaction({ signedKeyHashes: ["a".repeat(56), "b".repeat(56), "c".repeat(56)] })
    ),
    0
  );
});

test("an unknown or empty signer set has no outstanding count to report", () => {
  assert.equal(countOutstandingSigners(null), null);
  assert.equal(countOutstandingSigners(satisfaction({ requiredSigners: [] })), null);
});

test("the two operator paths use the words the rest of the app uses", () => {
  assert.equal(authorityPathLabel("admin"), "Owner");
  assert.equal(authorityPathLabel("multisig"), "Co-signers");
});
