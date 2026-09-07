import assert from "node:assert/strict";
import test from "node:test";
import { computeMintSetupSteps } from "./workspace-guided-derivations";

test("mint setup contains no shared helper task even when its service is unavailable", () => {
  const steps = computeMintSetupSteps({
    activeWallet: null, mintHasOwnerChoice: false, networkId: null,
    preview: null, previewMatchesSelectedAction: false, selectedAction: "mint",
    sharedReferenceReady: false, sharedSttReferenceStoreLoading: false,
    showSharedReferenceSetup: true, walletReady: false
  });
  assert.equal(steps.length, 3);
  assert.equal(steps.some((step) => step.targetId === "mint-section-helper"), false);
});
