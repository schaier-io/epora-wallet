import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";

import {
  activeBuildAtom,
  activeSubmitAtom,
  buildErrorAtom,
  buildErrorDetailsAtom,
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
  assert.equal(store.get(buildErrorDetailsAtom), null);
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

test("buildFailed records message + details", () => {
  const store = createStore();
  store.set(buildFailedAtom, { message: "boom", details: "stack" });
  assert.equal(store.get(buildErrorAtom), "boom");
  assert.equal(store.get(buildErrorDetailsAtom), "stack");
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
  store.set(buildErrorDetailsAtom, "stale");
  store.set(precheckFailedAtom, "Connect a wallet");
  assert.equal(store.get(buildErrorAtom), "Connect a wallet");
  assert.equal(store.get(buildErrorDetailsAtom), null);
});

test("resetFlow clears every display field (the wallet-change reset)", () => {
  const store = createStore();
  store.set(previewAtom, fakePreview);
  store.set(previewSignatureAtom, "sig");
  store.set(lastActionLabelAtom, "Mint");
  store.set(buildErrorAtom, "e");
  store.set(buildErrorDetailsAtom, "d");
  store.set(submitHashAtom, "h");
  store.set(mintConfirmationAtom, fakeConfirmation);

  store.set(resetFlowAtom);

  assert.equal(store.get(previewAtom), null);
  assert.equal(store.get(previewSignatureAtom), null);
  assert.equal(store.get(lastActionLabelAtom), "");
  assert.equal(store.get(buildErrorAtom), null);
  assert.equal(store.get(buildErrorDetailsAtom), null);
  assert.equal(store.get(submitHashAtom), null);
  assert.equal(store.get(mintConfirmationAtom), null);
});

test("clearMessages clears only the error banner, preserves preview", () => {
  const store = createStore();
  store.set(previewAtom, fakePreview);
  store.set(buildErrorAtom, "e");
  store.set(buildErrorDetailsAtom, "d");
  store.set(clearMessagesAtom);
  assert.equal(store.get(buildErrorAtom), null);
  assert.equal(store.get(buildErrorDetailsAtom), null);
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

test("stores are isolated — per-store values despite module-global atoms", () => {
  const a = createStore();
  const b = createStore();
  a.set(activeBuildAtom, "Mint");
  assert.equal(a.get(activeBuildAtom), "Mint");
  assert.equal(b.get(activeBuildAtom), null);
});
