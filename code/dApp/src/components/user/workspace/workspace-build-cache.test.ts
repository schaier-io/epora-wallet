import assert from "node:assert/strict";
import test from "node:test";
import { atom, createStore } from "jotai";
import { SLOT_CONFIG_NETWORK, slotToBeginUnixTime } from "@meshsdk/core";
import type { BuildResult } from "@/lib/types/contracts";
import { activePaymentKeyHashAtom, activeAddressAtom } from "@/providers/wallet.atoms";
import { runWorkspaceBuild } from "./workspace-build-cache";
import { buildErrorStaleInputsAtom, invalidateBuildAtom, previewSignatureAtom, resetAllFlowAtom, submitHashAtom } from "./atoms/transaction-flow.atoms";
import { pendingWalletStateUpdateAtom } from "./atoms/wallet-state-update.atoms";
import { mintStarterAssetsAtom } from "./atoms/forms/mint-form.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { selectedOrphanInputsAtom } from "./atoms/forms/orphan-inputs.atoms";

// Same minimal transaction layout as lib/proposals/assemble.test.ts; TTL is configurable.
function preview(ttl = 2_000_000_000): BuildResult {
  return {
    txHex: `84a40081825820${"aa".repeat(32)}00018182581d60${"bb".repeat(28)}1a004c4b40021a00030d40031a${ttl.toString(16).padStart(8, "0")}a0f5f6`,
    preview: { action: "mint", summary: "Test transaction" }
  } as BuildResult;
}

function deferred() {
  let resolve!: (result: BuildResult | null) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<BuildResult | null>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("identical requests share one pending promise across different callbacks", async () => {
  const store = createStore();
  const pending = deferred();
  let calls = 0;
  const first = runWorkspaceBuild(store, "mint", () => { calls++; return pending.promise; });
  const second = runWorkspaceBuild(store, "mint", async () => { calls++; return preview(); });
  assert.equal(first, second);
  assert.equal(calls, 1);
  const result = preview();
  pending.resolve(result);
  assert.equal(await first, result);
  assert.equal(await second, result);
  store.set(invalidateBuildAtom);
});

test("completed unexpired transaction is reused without clearing its preview signature", async () => {
  const store = createStore();
  const result = preview();
  assert.equal(await runWorkspaceBuild(store, "mint", async () => result), result);
  store.set(previewSignatureAtom, "built-signature");
  const reused = await runWorkspaceBuild(store, "mint", async () => { assert.fail("must reuse completed transaction"); });
  assert.equal(reused, result);
  assert.equal(store.get(previewSignatureAtom), "built-signature");
  store.set(invalidateBuildAtom);
});

for (const [name, invalidate] of [
  ["form edit", (store: ReturnType<typeof createStore>) => store.set(mintStarterAssetsAtom, [{ unit: "lovelace", quantity: "9000000" }])],
  ["payment key change", (store: ReturnType<typeof createStore>) => store.set(activePaymentKeyHashAtom, "bb")],
  ["session change", (store: ReturnType<typeof createStore>) => store.set(activeAddressAtom, "another-address")],
  ["explicit invalidation", (store: ReturnType<typeof createStore>) => store.set(invalidateBuildAtom)],
  ["session reset", (store: ReturnType<typeof createStore>) => store.set(resetAllFlowAtom)],
  ["action navigation", (store: ReturnType<typeof createStore>) => store.set(routeStateAtom, route => ({ ...route, selectedAction: "mint" }))],
  ["successful submit", (store: ReturnType<typeof createStore>) => store.set(submitHashAtom, "submitted")],
  ["stale input error", (store: ReturnType<typeof createStore>) => store.set(buildErrorStaleInputsAtom, true)],
  ["wallet state refresh", (store: ReturnType<typeof createStore>) => store.set(pendingWalletStateUpdateAtom, {
    walletUnit: "wallet", submittedTxHash: "submitted", spentRef: { txHash: "aa", outputIndex: 0 }
  })]
] as const) {
  test(`${name} immediately aborts pending work and settles without its underlying promise`, async () => {
    const store = createStore();
    const pending = deferred();
    let signal!: AbortSignal;
    const promise = runWorkspaceBuild(store, "mint", received => { signal = received; return pending.promise; });
    store.set(previewSignatureAtom, "old");
    invalidate(store);
    assert.equal(signal.aborted, true);
    assert.equal(store.get(previewSignatureAtom), null);
    assert.equal(await promise, null);
    pending.resolve(preview());
    assert.equal(store.get(previewSignatureAtom), null);
  });
}

test("a different key cancels old work without letting its late result disturb the new build", async () => {
  const store = createStore();
  const old = deferred();
  let oldSignal!: AbortSignal;
  const first = runWorkspaceBuild(store, "direct", signal => { oldSignal = signal; return old.promise; });
  const result = preview();
  const second = runWorkspaceBuild(store, "multisig", async () => result);
  assert.equal(oldSignal.aborted, true);
  assert.equal(await first, null);
  assert.equal(await second, result);
  store.set(previewSignatureAtom, "new");
  old.resolve(preview());
  await Promise.resolve();
  assert.equal(store.get(previewSignatureAtom), "new");
  assert.equal(await runWorkspaceBuild(store, "multisig", async () => assert.fail("must reuse new build")), result);
  store.set(invalidateBuildAtom);
});

test("failed and null builds can be retried", async () => {
  const store = createStore();
  await assert.rejects(runWorkspaceBuild(store, "mint", async () => { throw new Error("build failed"); }), /build failed/);
  assert.equal(await runWorkspaceBuild(store, "mint", async () => null), null);
  const result = preview();
  assert.equal(await runWorkspaceBuild(store, "mint", async () => result), result);
  store.set(invalidateBuildAtom);
});

test("expired builds are refused while malformed or unbounded builds cannot be reused", async () => {
  const withoutUpperBound = preview();
  withoutUpperBound.txHex = withoutUpperBound.txHex.replace("84a4", "84a3").replace("031a77359400", "");
  for (const stale of [withoutUpperBound, { ...preview(), txHex: "malformed" }]) {
    const store = createStore();
    assert.equal(await runWorkspaceBuild(store, "mint", async () => stale), stale);
    const fresh = preview();
    assert.equal(await runWorkspaceBuild(store, "mint", async () => fresh), fresh);
    store.set(invalidateBuildAtom);
  }
  assert.equal(await runWorkspaceBuild(createStore(), "mint", async () => preview(1)), null);
});

test("a pending transaction that expires before completion returns null", async t => {
  const store = createStore();
  const ttl = 200_000_000;
  const expires = slotToBeginUnixTime(ttl, SLOT_CONFIG_NETWORK.preprod);
  t.mock.timers.enable({ apis: ["Date"], now: expires - 1 });
  const pending = deferred();
  const first = runWorkspaceBuild(store, "mint", () => pending.promise);
  t.mock.timers.tick(1);
  store.set(previewSignatureAtom, "finished");
  pending.resolve(preview(ttl));
  assert.equal(await first, null);
  assert.equal(store.get(previewSignatureAtom), null);
});

for (const ready of [false, true]) {
  test(`${ready ? "ready" : "pending"} requests recheck identity inside an atomic write before subscribers run`, async () => {
    const store = createStore();
    const pending = deferred();
    const first = runWorkspaceBuild(store, "mint", () => ready ? Promise.resolve(preview()) : pending.promise);
    if (ready) await first;
    const result = preview();
    let replacement!: Promise<BuildResult | null>;
    const editAndRequest = atom(null, (_get, set) => {
      set(activePaymentKeyHashAtom, "edited-key");
      replacement = runWorkspaceBuild(store, "mint", async () => result);
    });
    store.set(editAndRequest);
    assert.notEqual(replacement, first);
    assert.equal(await replacement, result);
    if (!ready) assert.equal(await first, null);
    pending.resolve(preview());
    store.set(invalidateBuildAtom);
  });
}

test("clock ticks and review step navigation keep an identical pending build alive", async () => {
  const store = createStore();
  const pending = deferred();
  let signal!: AbortSignal;
  const first = runWorkspaceBuild(store, "mint", received => { signal = received; return pending.promise; });
  store.set(renderNowMsAtom, Date.now());
  store.set(routeStateAtom, route => ({ ...route, flowStep: "configure" }));
  assert.equal(signal.aborted, false);
  assert.equal(runWorkspaceBuild(store, "mint", async () => assert.fail("must join pending build")), first);
  const result = preview();
  pending.resolve(result);
  assert.equal(await first, result);
  store.set(invalidateBuildAtom);
});

test("completed validity expires at its CBOR upper bound", async t => {
  const store = createStore();
  const ttl = 200_000_000;
  const expires = slotToBeginUnixTime(ttl, SLOT_CONFIG_NETWORK.preprod);
  t.mock.timers.enable({ apis: ["Date"], now: expires - 1 });
  const first = preview(ttl);
  await runWorkspaceBuild(store, "mint", async () => first);
  assert.equal(await runWorkspaceBuild(store, "mint", async () => assert.fail("still valid")), first);
  t.mock.timers.tick(1);
  const next = preview();
  assert.equal(await runWorkspaceBuild(store, "mint", async () => next), next);
  store.set(invalidateBuildAtom);
});

test("ready result is retired on successful submit", async () => {
  const store = createStore();
  const first = preview();
  await runWorkspaceBuild(store, "mint", async () => first);
  store.set(submitHashAtom, "submitted");
  const next = preview();
  assert.equal(await runWorkspaceBuild(store, "mint", async () => next), next);
  store.set(invalidateBuildAtom);
});

test("a stale-input signing rejection retires the completed result but permits a new build", async () => {
  const store = createStore();
  await runWorkspaceBuild(store, "mint", async () => preview());
  store.set(previewSignatureAtom, "completed");
  store.set(buildErrorStaleInputsAtom, true);
  assert.equal(store.get(previewSignatureAtom), null);
  let signal!: AbortSignal;
  const result = preview();
  assert.equal(await runWorkspaceBuild(store, "mint", async received => {
    signal = received;
    store.set(buildErrorStaleInputsAtom, false);
    return result;
  }), result);
  assert.equal(signal.aborted, false);
  store.set(buildErrorStaleInputsAtom, true);
  assert.equal(signal.aborted, true);
});

test("separate stores do not share or cancel each other's builds", async () => {
  const firstStore = createStore();
  const secondStore = createStore();
  const firstPending = deferred();
  let signal!: AbortSignal;
  const first = runWorkspaceBuild(firstStore, "mint", received => { signal = received; return firstPending.promise; });
  const result = preview();
  assert.equal(await runWorkspaceBuild(secondStore, "mint", async () => result), result);
  secondStore.set(invalidateBuildAtom);
  assert.equal(signal.aborted, false);
  firstPending.resolve(result);
  assert.equal(await first, result);
  firstStore.set(invalidateBuildAtom);
});

for (const ready of [false, true]) {
  test(`new unselected beneficiary pool invalidates ${ready ? "ready warning" : "pending review"} and rebuilds`, async () => {
    const store = createStore();
    store.set(routeStateAtom, route => ({ ...route, selectedAction: "use-beneficiary", selectedWalletUnit: "wallet" }));
    store.set(selectedOrphanInputsAtom, { walletUnit: "wallet", signerAddress: null, outputs: [] });
    const pending = deferred();
    let signal!: AbortSignal;
    const first = runWorkspaceBuild(store, "beneficiary", received => {
      signal = received;
      return ready ? Promise.resolve(preview()) : pending.promise;
    });
    if (ready) await first;
    store.set(previewSignatureAtom, "all-pools-reviewed");
    store.set(selectedOrphanInputsAtom, {
      walletUnit: "wallet", signerAddress: null,
      outputs: [{ txHash: "aa".repeat(32), outputIndex: 0, address: "orphan-address", lovelace: "9000000", assets: [] }]
    });
    assert.equal(signal.aborted, true);
    assert.equal(store.get(previewSignatureAtom), null);
    if (!ready) assert.equal(await first, null);
    const revised = { ...preview(), warnings: ["Review newly discovered funds."] };
    let rebuilds = 0;
    assert.equal(await runWorkspaceBuild(store, "beneficiary", async () => { rebuilds++; return revised; }), revised);
    assert.equal(rebuilds, 1);
    pending.resolve(preview());
    store.set(invalidateBuildAtom);
  });
}
