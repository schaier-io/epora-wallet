import assert from "node:assert/strict";
import test from "node:test";
import { computeMintSetupSteps } from "./workspace-guided-derivations";

test("mint setup contains no shared helper task even when its service is unavailable", () => {
  const steps = computeMintSetupSteps({
    activeWallet: null, mintHasOwnerChoice: false, networkId: null,
    walletReady: false
  });
  assert.equal(steps.length, 3);
  assert.equal(steps.some((step) => step.targetId === "mint-section-helper"), false);
});

// The preview is no longer an input: only `mintConfirmed` can complete Confirm, so a
// built-but-unsigned draft cannot reach "done" by construction.
test("without an on-chain confirmation the mint Confirm step is not done", () => {
  const steps = computeMintSetupSteps({
    activeWallet: {} as never, mintHasOwnerChoice: true, networkId: 0,
    walletReady: true
  });
  const confirm = steps.at(-1);
  assert.equal(confirm?.label, "Confirm");
  assert.equal(confirm?.status, "active");
  assert.equal(steps.filter((step) => step.status === "done").length < steps.length, true);
  assert.doesNotMatch(confirm?.description ?? "", /Ready in your wallet/);
});

test("an on-chain mint confirmation marks Confirm done", () => {
  const steps = computeMintSetupSteps({
    activeWallet: {} as never, mintConfirmed: true, mintHasOwnerChoice: true,
    networkId: 0, walletReady: true
  });
  const confirm = steps.at(-1);
  assert.equal(confirm?.status, "done");
  assert.equal(steps.every((step) => step.status === "done"), true);
});
