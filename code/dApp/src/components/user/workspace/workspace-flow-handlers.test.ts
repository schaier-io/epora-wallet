import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";
import { type BuildResult } from "@/lib/types/contracts";

import {
  createWorkspaceFlowHandlers,
  type WorkspaceFlowHandlersCtx
} from "./workspace-flow-handlers";
import { OwnedMessageError } from "./helpers/build-errors";
import { mintConfirmationRunAtom } from "./atoms/transaction-flow.atoms";

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
    "use",
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

  await withBuildGuard("use", () => Promise.reject(new Error('{"boom":true}')));

  const errorWrites = calls.setBuildError ?? [];
  assert.equal(errorWrites.length, 2);
  assert.match(String(errorWrites[1][0]), /Something went wrong/);
  assert.equal(errorWrites[1][1], false);
});

test("a declined signature stays calm and recovery-free, with the draft kept", async () => {
  const { ctx, calls } = makeCtx();
  const { withBuildGuard } = createWorkspaceFlowHandlers(ctx);

  await withBuildGuard(
    "use",
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

test("an older overlapping build cannot overwrite the newer run's state", async () => {
  const { ctx, calls } = makeCtx();
  const { withBuildGuard } = createWorkspaceFlowHandlers(ctx);

  // Two builds start before either settles (the double-click / save-races-continue
  // window React batching leaves open). The newer start wins the run token.
  let settleOlder!: (settle: { ok: boolean; value?: unknown }) => void;
  let settleNewer!: (settle: { ok: boolean; value?: unknown }) => void;
  const older = withBuildGuard(
    "use",
    () => new Promise((resolve, reject) => settleOlder = (s) => s.ok ? resolve(s.value as BuildResult) : reject(s.value))
  );
  const newer = withBuildGuard(
    "use",
    () => new Promise((resolve, reject) => settleNewer = (s) => s.ok ? resolve(s.value as BuildResult) : reject(s.value))
  );

  settleNewer({ ok: true, value: fakePreview });
  assert.equal(await newer, fakePreview);
  // The older run fails AFTER the newer one already succeeded: its catch must not
  // overwrite the newer run's preview with a stale error and diagnostic id, and
  // its finally must not clear the newer run's in-flight marker.
  settleOlder({ ok: false, value: new Error('{"boom":true}') });
  assert.equal(await older, null);

  // Both starts cleared the error; no error write ever followed.
  const errorWrites = calls.setBuildError ?? [];
  assert.equal(errorWrites.length, 2);
  assert.deepEqual(errorWrites[0], [null]);
  assert.deepEqual(errorWrites[1], [null]);
  // Exactly one preview (the newer run's), and three in-flight writes: two starts
  // plus the newer run's settle. The older run's finally wrote nothing.
  assert.deepEqual(calls.setPreview?.[0], [fakePreview]);
  assert.equal(calls.setPreview?.length, 1);
  assert.equal(calls.setActiveBuild?.length, 3);
});

test("an older overlapping build returns no preview after the newer run wins", async () => {
  const { ctx } = makeCtx();
  const { withBuildGuard } = createWorkspaceFlowHandlers(ctx);
  const olderPreview = { txHex: "older" } as unknown as BuildResult;

  let settleOlder!: (preview: BuildResult) => void;
  let settleNewer!: (preview: BuildResult) => void;
  const older = withBuildGuard(
    "use",
    () => new Promise((resolve) => { settleOlder = resolve; })
  );
  const newer = withBuildGuard(
    "use",
    () => new Promise((resolve) => { settleNewer = resolve; })
  );

  settleNewer(fakePreview);
  assert.equal(await newer, fakePreview);
  settleOlder(olderPreview);

  assert.equal(await older, null);
});

test("a re-render during a pending build cannot let the older run overwrite newer state", async () => {
  const { ctx, calls } = makeCtx();
  const startPending = (factory: ReturnType<typeof createWorkspaceFlowHandlers>) => {
    let settle!: (s: { ok: boolean; value?: unknown }) => void;
    const pending = factory.withBuildGuard(
      "use",
      () => new Promise((resolve, reject) => settle = (s) => s.ok ? resolve(s.value as BuildResult) : reject(s.value))
    );
    return { pending, settle };
  };

  // Render 1 starts a build; the re-render recreates the handlers factory
  // (fresh closures, per-render call), and render 2 starts the newer build.
  const first = startPending(createWorkspaceFlowHandlers(ctx));
  const second = startPending(createWorkspaceFlowHandlers(ctx));

  second.settle({ ok: true, value: fakePreview });
  assert.equal(await second.pending, fakePreview);
  // The render-1 run fails AFTER the newer one succeeded: with a per-render
  // counter its late catch would pass its own token check and clobber the
  // newer run's preview, error, and diagnostic id.
  first.settle({ ok: false, value: new Error('{"boom":true}') });
  assert.equal(await first.pending, null);

  const errorWrites = calls.setBuildError ?? [];
  assert.deepEqual(errorWrites[errorWrites.length - 1], [null]);
  assert.deepEqual(calls.setPreview?.[0], [fakePreview]);
  assert.equal(calls.setPreview?.length, 1);
  assert.equal(calls.setActiveBuild?.length, 3);
});

test("an invalidated final mint scan settles as delayed", async () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout: (callback: () => void) => (callback(), 0) }
  });
  const { ctx, calls } = makeCtx({
    refreshDetectedTokens: async () => null
  });

  try {
    await createWorkspaceFlowHandlers(ctx).watchMintCreationConfirmation(HASH);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }

  const confirmations = calls.setMintConfirmation ?? [];
  assert.equal(
    (confirmations.at(-1)?.[0] as { phase?: string } | undefined)?.phase,
    "delayed"
  );
});

test("an invalidated scan cannot overwrite a newer mint confirmation run", async () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout: (callback: () => void) => (callback(), 0) }
  });
  const { ctx, calls } = makeCtx();
  ctx.refreshDetectedTokens = async () => {
    ctx.jotaiStore.set(
      mintConfirmationRunAtom,
      ctx.jotaiStore.get(mintConfirmationRunAtom) + 1
    );
    ctx.setMintConfirmation({
      txHash: "new-run",
      phase: "waiting",
      attempts: 0,
      maxAttempts: 12,
      updatedAt: 1
    });
    return null;
  };

  try {
    await createWorkspaceFlowHandlers(ctx).watchMintCreationConfirmation(HASH);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }

  const confirmations = calls.setMintConfirmation ?? [];
  assert.equal(
    (confirmations.at(-1)?.[0] as { txHash?: string } | undefined)?.txHash,
    "new-run"
  );
});
