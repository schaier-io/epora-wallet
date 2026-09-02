import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";

import {
  activeBuildAtom,
  activeSubmitAtom,
  buildErrorAtom,
  buildErrorExpectedAtom,
  buildErrorStaleInputsAtom,
  buildErrorWriteAtom,
  submitHashAtom,
  previewAtom,
  previewSignatureAtom,
  lastActionLabelAtom,
  mintConfirmationAtom,
  isBuildingAtom,
  precheckFailedAtom,
  buildStartedAtom,
  buildSucceededAtom,
  buildFailedAtom,
  buildSettledAtom,
  submitStartedAtom,
  submitSucceededAtom,
  submitSettledAtom,
  resetFlowAtom,
  clearMessagesAtom,
  resetAllFlowAtom,
  mintCelebrationAtom,
  dismissedSubmitHashAtom
} from "./transaction-flow.atoms";
import type { BuildResult } from "@/lib/types/contracts";
import type { MintConfirmationState } from "@/components/user/workspace/types";

// The flow atoms store these opaquely (identity only), so casts suffice as fixtures.
const fakePreview = { txHex: "deadbeef" } as unknown as BuildResult;
const fakeConfirmation = { phase: "pending" } as unknown as MintConfirmationState;

test("initial flow state is idle/empty", () => {
  const store = createStore();
  assert.equal(store.get(activeBuildAtom), null);
  assert.equal(store.get(activeSubmitAtom), false);
  assert.equal(store.get(buildErrorAtom), null);
  assert.equal(store.get(previewAtom), null);
  assert.equal(store.get(isBuildingAtom), false);
});

test("buildStarted sets activeBuild, clears error/hash/confirmation, keeps stale preview", () => {
  const store = createStore();
  store.set(previewAtom, fakePreview);
  store.set(buildErrorAtom, "old");
  store.set(submitHashAtom, "oldhash");
  store.set(mintConfirmationAtom, fakeConfirmation);

  store.set(buildStartedAtom, "Mint");

  assert.equal(store.get(activeBuildAtom), "Mint");
  assert.equal(store.get(isBuildingAtom), true);
  assert.equal(store.get(buildErrorAtom), null);
  assert.equal(store.get(buildErrorExpectedAtom), false);
  assert.equal(store.get(submitHashAtom), null);
  assert.equal(store.get(mintConfirmationAtom), null);
  // Stale preview is intentionally preserved until the new build settles.
  assert.equal(store.get(previewAtom), fakePreview);
});

test("buildSucceeded records preview/label/signature", () => {
  const store = createStore();
  store.set(buildSucceededAtom, { preview: fakePreview, label: "Mint", signature: "sig" });
  assert.equal(store.get(previewAtom), fakePreview);
  assert.equal(store.get(lastActionLabelAtom), "Mint");
  assert.equal(store.get(previewSignatureAtom), "sig");
});

test("buildFailed records message + expected tone", () => {
  const store = createStore();
  store.set(buildFailedAtom, { message: "You declined to sign in your wallet.", expected: true });
  assert.equal(store.get(buildErrorAtom), "You declined to sign in your wallet.");
  assert.equal(store.get(buildErrorExpectedAtom), true);
});

test("buildSettled clears only the in-flight marker; preview survives", () => {
  const store = createStore();
  store.set(buildStartedAtom, "Mint");
  store.set(buildSucceededAtom, { preview: fakePreview, label: "Mint", signature: null });
  store.set(buildSettledAtom);
  assert.equal(store.get(activeBuildAtom), null);
  assert.equal(store.get(previewAtom), fakePreview);
});

test("submit cycle: started → succeeded(hash) → settled, hash persists", () => {
  const store = createStore();
  store.set(submitStartedAtom);
  assert.equal(store.get(activeSubmitAtom), true);
  store.set(submitSucceededAtom, "txhash123");
  assert.equal(store.get(submitHashAtom), "txhash123");
  store.set(submitSettledAtom);
  assert.equal(store.get(activeSubmitAtom), false);
  assert.equal(store.get(submitHashAtom), "txhash123");
});

test("precheckFailed sets error, clears stale details", () => {
  const store = createStore();
  store.set(buildErrorExpectedAtom, true);
  store.set(precheckFailedAtom, "Connect a wallet");
  assert.equal(store.get(buildErrorAtom), "Connect a wallet");
  assert.equal(store.get(buildErrorExpectedAtom), false);
});

test("resetFlow clears every display field (the wallet-change reset)", () => {
  const store = createStore();
  store.set(previewAtom, fakePreview);
  store.set(previewSignatureAtom, "sig");
  store.set(lastActionLabelAtom, "Mint");
  store.set(buildErrorAtom, "e");
  store.set(buildErrorExpectedAtom, true);
  store.set(submitHashAtom, "h");
  store.set(mintConfirmationAtom, fakeConfirmation);

  store.set(resetFlowAtom);

  assert.equal(store.get(previewAtom), null);
  assert.equal(store.get(previewSignatureAtom), null);
  assert.equal(store.get(lastActionLabelAtom), "");
  assert.equal(store.get(buildErrorAtom), null);
  assert.equal(store.get(buildErrorExpectedAtom), false);
  assert.equal(store.get(submitHashAtom), null);
  assert.equal(store.get(mintConfirmationAtom), null);
});

test("clearMessages clears only the error banner, preserves preview", () => {
  const store = createStore();
  store.set(previewAtom, fakePreview);
  store.set(buildErrorAtom, "e");
  store.set(buildErrorExpectedAtom, true);
  store.set(clearMessagesAtom);
  assert.equal(store.get(buildErrorAtom), null);
  assert.equal(store.get(buildErrorExpectedAtom), false);
  assert.equal(store.get(previewAtom), fakePreview);
});

test("resetAllFlow clears every atom including activeBuild/celebration/dismissed", () => {
  const store = createStore();
  store.set(buildStartedAtom, "Mint");
  store.set(submitStartedAtom);
  store.set(submitSucceededAtom, "h");
  store.set(previewAtom, fakePreview);
  store.set(mintCelebrationAtom, {
    walletName: "w",
    sttPolicyId: null,
    createdWalletUnit: "u"
  });
  store.set(dismissedSubmitHashAtom, "d");

  store.set(resetAllFlowAtom);

  assert.equal(store.get(activeBuildAtom), null);
  assert.equal(store.get(activeSubmitAtom), false);
  assert.equal(store.get(submitHashAtom), null);
  assert.equal(store.get(previewAtom), null);
  assert.equal(store.get(mintCelebrationAtom), null);
  assert.equal(store.get(dismissedSubmitHashAtom), null);
});

test("stores are isolated: per-store values despite module-global atoms", () => {
  const a = createStore();
  const b = createStore();
  a.set(activeBuildAtom, "Mint");
  assert.equal(a.get(activeBuildAtom), "Mint");
  assert.equal(b.get(activeBuildAtom), null);
});

// The stale-inputs flag arms the review rail's refresh-chain-state recovery. It only
// ever pairs with a live error, so every error write/reset path must clear it.
test("the build-error write pairs the message with the stale-inputs flag", () => {
  const store = createStore();
  store.set(buildErrorWriteAtom, {
    message: "Fund pool ab#0 has already been spent.",
    staleInputs: true
  });
  assert.match(store.get(buildErrorAtom) ?? "", /already been spent/);
  assert.equal(store.get(buildErrorStaleInputsAtom), true);

  // A later plain write clears the flag (the default), so the affordance cannot
  // outlive the error it was armed for.
  store.set(buildErrorWriteAtom, { message: "Something went wrong." });
  assert.equal(store.get(buildErrorStaleInputsAtom), false);
  assert.equal(store.get(buildErrorAtom), "Something went wrong.");
});

test("buildFailed can arm the stale-inputs flag alongside the message", () => {
  const store = createStore();
  store.set(buildFailedAtom, {
    message: "Fund pool ab#0 has already been spent.",
    expected: true,
    staleInputs: true
  });
  assert.equal(store.get(buildErrorStaleInputsAtom), true);

  // A later plain failure disarms the affordance.
  store.set(buildFailedAtom, { message: "Something went wrong.", expected: false });
  assert.equal(store.get(buildErrorStaleInputsAtom), false);
});

test("buildStarted clears the stale-inputs flag before each build", () => {
  const store = createStore();
  store.set(buildErrorStaleInputsAtom, true);
  store.set(buildStartedAtom, "Mint");
  assert.equal(store.get(buildErrorStaleInputsAtom), false);
});

test("resetFlow and clearMessages clear the stale-inputs flag; clearMessages keeps the preview", () => {
  const resetStore = createStore();
  resetStore.set(buildErrorStaleInputsAtom, true);
  resetStore.set(resetFlowAtom);
  assert.equal(resetStore.get(buildErrorStaleInputsAtom), false);

  const clearStore = createStore();
  clearStore.set(previewAtom, fakePreview);
  clearStore.set(buildErrorStaleInputsAtom, true);
  clearStore.set(clearMessagesAtom);
  assert.equal(clearStore.get(buildErrorStaleInputsAtom), false);
  assert.equal(clearStore.get(previewAtom), fakePreview);
});

test("resetAllFlow clears the stale-inputs flag", () => {
  const store = createStore();
  store.set(buildErrorStaleInputsAtom, true);
  store.set(resetAllFlowAtom);
  assert.equal(store.get(buildErrorStaleInputsAtom), false);
});
