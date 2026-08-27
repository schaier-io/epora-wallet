import assert from "node:assert/strict";
import test from "node:test";
import { buildMintProgressCopy } from "@/components/user/workspace/mint-progress-completion";
import { type MintConfirmationState } from "@/components/user/workspace/types";

function confirmation(
  phase: MintConfirmationState["phase"],
  attempts = 0
): MintConfirmationState {
  return { txHash: "ab".repeat(32), phase, attempts, maxAttempts: 12, updatedAt: 0 };
}

/**
 * The overlay this copy feeds mounts only while `phase !== "confirmed"`
 * (`workspace-view.tsx:60-61`). Its title read `Congrats, ${walletName} is created` for
 * every phase except `submitting`, so a reader waiting on an unconfirmed transaction was
 * congratulated on a wallet that could still fail, directly above a status line that read
 * "Waiting for chain confirmation."
 */
test("no phase the overlay can show claims the wallet exists", () => {
  const shown: MintConfirmationState["phase"][] = [
    "submitting",
    "waiting",
    "refreshing",
    "delayed"
  ];

  for (const phase of shown) {
    const { title } = buildMintProgressCopy(confirmation(phase), "Family wallet");
    assert.doesNotMatch(title, /congrat/i, `${phase}: ${title}`);
    assert.doesNotMatch(title, /is created|is live/i, `${phase}: ${title}`);
    assert.match(title, /Family wallet/);
  }
});

/**
 * `onClose` only sets `dismissedSubmitHash`. The confirmation poll and the celebration
 * overlay both carry on without this overlay, so telling the reader to keep it open was
 * asking for something that does not matter.
 */
test("the waiting copy does not ask the reader to keep the overlay open", () => {
  const { description } = buildMintProgressCopy(confirmation("waiting"), "Family wallet");

  assert.doesNotMatch(description, /keep this open/i);
  assert.doesNotMatch(description, /in the background/i);
});

test("no shipped string carries an em dash", () => {
  const phases: MintConfirmationState["phase"][] = [
    "submitting",
    "waiting",
    "refreshing",
    "delayed",
    "confirmed"
  ];

  for (const phase of phases) {
    const copy = buildMintProgressCopy(confirmation(phase), "Family wallet");
    for (const value of [copy.title, copy.description, copy.statusLabel]) {
      assert.doesNotMatch(value, /[—–]/, `${phase}: ${value}`);
    }
  }
});

test("progress climbs with the confirmation attempts and never leaves 0-100", () => {
  assert.equal(buildMintProgressCopy(confirmation("submitting"), "W").progress, 8);
  assert.equal(buildMintProgressCopy(confirmation("delayed"), "W").progress, 92);

  const first = buildMintProgressCopy(confirmation("waiting", 0), "W").progress;
  const later = buildMintProgressCopy(confirmation("waiting", 6), "W").progress;
  const capped = buildMintProgressCopy(confirmation("waiting", 999), "W").progress;

  assert.equal(first, 30);
  assert.ok(later > first, `${later} should exceed ${first}`);
  assert.equal(capped, 90);
});

test("a missing confirmation still produces waiting copy rather than throwing", () => {
  const copy = buildMintProgressCopy(null, "Family wallet");

  assert.equal(copy.title, "Confirming Family wallet…");
  assert.equal(copy.progress, 30);
});
