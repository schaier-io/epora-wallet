import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { currentRecoveryCapacityFailureAtom } from "./atoms/recovery-capacity.atoms";
import { sttWalletInputsAtom } from "./atoms/forms/stt-spend-form.atoms";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";
import { type BuildResult } from "@/lib/types/contracts";

import {
  createWorkspaceFlowHandlers,
  type WorkspaceFlowHandlersCtx
} from "./workspace-flow-handlers";
import { OwnedMessageError } from "./helpers/build-errors";
import { resetAllFlowAtom, resetFlowAtom, mintConfirmationRunAtom } from "./atoms/transaction-flow.atoms";
import { resolveWalletSpendAddress } from "@/lib/contracts/blueprint";

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
    runWalletTransactionsRefresh: record("runWalletTransactionsRefresh"),
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

test("a confirmed mint refreshes the created wallet activity before completion", async () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout: (callback: () => void) => (callback(), 0) }
  });
  const createdToken = {
    policyId: "aa".repeat(28),
    assetNameHex: "01",
    unit: `${"aa".repeat(28)}01`,
    scriptAddress: "addr_test1stt",
    utxo: {
      input: { txHash: HASH, outputIndex: 0 },
      output: { address: "addr_test1stt", amount: [] }
    },
    datum: null
  };
  let requestedUnit: string | undefined;
  const { ctx, calls } = makeCtx({
    refreshDetectedTokens: async (options?: { knownUnit?: string }) => {
      requestedUnit = options?.knownUnit;
      return { tokens: [createdToken] };
    }
  });

  try {
    await createWorkspaceFlowHandlers(ctx).watchMintCreationConfirmation(HASH, createdToken.unit);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow
    });
  }

  assert.equal(requestedUnit, createdToken.unit);
  assert.deepEqual(calls.runWalletTransactionsRefresh, [[{
    walletAddress: resolveWalletSpendAddress({
      sttPolicyId: createdToken.policyId,
      sttAssetNameHex: createdToken.assetNameHex
    }),
    sttScriptAddress: createdToken.scriptAddress,
    sttUnit: createdToken.unit,
    anchorTxHashes: [HASH]
  }]]);
  assert.equal(
    (calls.setMintConfirmation?.at(-1)?.[0] as { phase?: string } | undefined)?.phase,
    "confirmed"
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

test("Exit capacity failure records fallback, while a later funding failure clears it", async () => {
  const { ctx } = makeCtx();
  ctx.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=exit-beneficiary")));
  const handlers = createWorkspaceFlowHandlers(ctx);
  await handlers.withBuildGuard("exit-beneficiary", async () => { throw new Error("Serialized transaction uses 17000 bytes. The protocol limit is 16384."); });
  assert.equal(ctx.jotaiStore.get(currentRecoveryCapacityFailureAtom)?.kind, "bytes");
  await handlers.withBuildGuard("exit-beneficiary", async () => { throw new Error("Insufficient funds"); });
  assert.equal(ctx.jotaiStore.get(currentRecoveryCapacityFailureAtom), null);
});
test("a capacity failure after an Exit input edit cannot offer fallback for the new draft", async () => {
  const { ctx } = makeCtx();
  ctx.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=exit-beneficiary")));
  await createWorkspaceFlowHandlers(ctx).withBuildGuard("exit-beneficiary", async () => {
    ctx.jotaiStore.set(sttWalletInputsAtom, [{ txHash: "aa".repeat(32), outputIndex: 0 }]);
    throw new Error("Serialized transaction uses 17000 bytes. The protocol limit is 16384.");
  });
  assert.equal(ctx.jotaiStore.get(currentRecoveryCapacityFailureAtom), null);
});

// A retired workspace must never receive a late build result or error.
for (const reset of [resetFlowAtom, resetAllFlowAtom]) {
  for (const outcome of ["success", "failure"] as const) {
    test(`drops build ${outcome} after ${reset === resetFlowAtom ? "flow reset" : "unmount reset"}`, async () => {
      const { ctx, calls } = makeCtx();
      let settle!: () => void;
      const pending = createWorkspaceFlowHandlers(ctx).withBuildGuard("mint", () =>
        new Promise((resolve, reject) => {
          settle = () => outcome === "success" ? resolve(fakePreview) : reject(new Error("late failure"));
        })
      );
      ctx.jotaiStore.set(reset);
      settle();
      assert.equal(await pending, null);
      assert.equal(calls.setPreview, undefined);
      assert.deepEqual(calls.setBuildError, [[null]]);
    });
  }
}

test("drops a build after the selected wallet changes", async () => {
  const { ctx, calls } = makeCtx();
  ctx.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("wallet=wallet-a")));
  let resolve!: (value: BuildResult) => void;
  const pending = createWorkspaceFlowHandlers(ctx).withBuildGuard("use", () => new Promise(done => { resolve = done; }));
  ctx.jotaiStore.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("wallet=wallet-b")));
  resolve(fakePreview);
  assert.equal(await pending, null);
  assert.equal(calls.setPreview, undefined);
});

test("builds in separate workspace stores do not invalidate each other", async () => {
  const first = makeCtx();
  const second = makeCtx();
  let resolve!: (value: BuildResult) => void;
  const pending = createWorkspaceFlowHandlers(first.ctx).withBuildGuard("use", () => new Promise(done => { resolve = done; }));
  await createWorkspaceFlowHandlers(second.ctx).withBuildGuard("mint", async () => fakePreview);
  resolve(fakePreview);
  assert.equal(await pending, fakePreview);
  assert.deepEqual(first.calls.setPreview, [[fakePreview]]);
});
