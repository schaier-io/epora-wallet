import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";
import { type BuildResult } from "@/lib/types/contracts";

import {
  createWorkspaceFlowHandlers,
  type WorkspaceFlowHandlersCtx
} from "./workspace-flow-handlers";
import { OwnedMessageError } from "./helpers/build-errors";

// 64 hex chars: the ref shape a stale-inputs failure reports.
const HASH = "cd".repeat(32);
const fakePreview = { txHex: "deadbeef" } as unknown as BuildResult;

// Every setter is a recorder. The guard under test owns no draft state itself; it
// preserves the draft precisely by never touching anything result-shaped on failure,
// so the recorded calls are the assertion surface.
function makeCtx(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string) => (...args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };
  const ctx = {
    activeWallet: { id: "test" },
    activeWalletName: "Test Wallet",
    isDemoWallet: false,
    networkId: 0,
    buildActionSignature: () => "signature",
    jotaiStore: createStore(),
    lockingContract: { address: "addr_test" },
    prependSubmittedTransaction: record("prependSubmittedTransaction"),
    proposalCaptureRef: { current: null },
    refreshDetectedTokens: record("refreshDetectedTokens"),
    refreshLockedContractUtxos: record("refreshLockedContractUtxos"),
    refreshPermissionWalletSummaries: record("refreshPermissionWalletSummaries"),
    refreshWalletBalance: record("refreshWalletBalance"),
    setActiveBuild: record("setActiveBuild"),
    setBuildError: record("setBuildError"),
    setBuildErrorExpected: record("setBuildErrorExpected"),
    setLastActionLabel: record("setLastActionLabel"),
    setMintConfirmation: record("setMintConfirmation"),
    setPreview: record("setPreview"),
    setPreviewSignature: record("setPreviewSignature"),
    setSubmitHash: record("setSubmitHash"),
    ...overrides
  } as unknown as WorkspaceFlowHandlersCtx;
  return { ctx, calls };
}

test("stale fund-pool build failure arms the recovery flag and keeps the draft state", async () => {
  const { ctx, calls } = makeCtx();
  const { withBuildGuard } = createWorkspaceFlowHandlers(ctx);

  const result = await withBuildGuard(
    "wallet-spend",
    () => Promise.reject(new Error(`Unknown transaction input (missing from UTxO set): ${HASH}#0`)),
    { walletInputRefs: [{ txHash: HASH, outputIndex: 0 }] }
  );

  assert.equal(result, null);
  const errorWrites = calls.setBuildError ?? [];
  assert.equal(errorWrites.length, 2);
  // Start of build clears any prior error (the foundation wrapper pairs the flag
  // with every write; the factory itself passes just the message here).
  assert.deepEqual(errorWrites[0], [null]);
  assert.match(String(errorWrites[1][0]), /already been spent/);
  assert.ok(String(errorWrites[1][0]).includes(`${HASH}#0`));
  assert.equal(errorWrites[1][1], true);
  // Nothing result-shaped was written: the draft and any prior preview stay intact.
  // (setSubmitHash(null) at build start is the guard's own pre-existing reset.)
  assert.equal(calls.setPreview, undefined);
  assert.equal(calls.setLastActionLabel, undefined);
});

test("a plain build failure does not arm the recovery affordance", async () => {
  const { ctx, calls } = makeCtx();
  const { withBuildGuard } = createWorkspaceFlowHandlers(ctx);

  await withBuildGuard("wallet-spend", () => Promise.reject(new Error('{"boom":true}')));

  const errorWrites = calls.setBuildError ?? [];
  assert.equal(errorWrites.length, 2);
  assert.match(String(errorWrites[1][0]), /Something went wrong/);
  assert.equal(errorWrites[1][1], false);
});

test("a declined signature stays calm and recovery-free, with the draft kept", async () => {
  const { ctx, calls } = makeCtx();
  const { withBuildGuard } = createWorkspaceFlowHandlers(ctx);

  await withBuildGuard(
    "wallet-spend",
    () => Promise.reject(new OwnedMessageError("User declined to sign tx"))
  );

  const errorWrites = calls.setBuildError ?? [];
  assert.equal(errorWrites.length, 2);
  assert.match(String(errorWrites[1][0]), /declined to sign/i);
  assert.equal(errorWrites[1][1], false);
  assert.equal(calls.setPreview, undefined);
});

test("a successful build clears prior error state and records the preview", async () => {
  const { ctx, calls } = makeCtx();
  const { withBuildGuard } = createWorkspaceFlowHandlers(ctx);

  const returned = await withBuildGuard("mint", () => Promise.resolve(fakePreview));

  assert.equal(returned, fakePreview);
  const errorWrites = calls.setBuildError ?? [];
  assert.equal(errorWrites.length, 1);
  assert.deepEqual(errorWrites[0], [null]);
  assert.deepEqual(calls.setPreview?.[0], [fakePreview]);
});
