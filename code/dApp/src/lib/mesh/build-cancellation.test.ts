import assert from "node:assert/strict";
import test from "node:test";
import { abortable, createAbortableWalletSource } from "./build-cancellation";
import { ServerFetcher } from "./server-fetcher";
import type { WalletSource } from "./tx-context";
import { buildTransactionWithReestimatedLimits } from "./transactions/internals/budget";
import { setupTransaction } from "./transactions/internals/core";
import { createBuildParameterFetcher } from "./transactions/internals/build-parameter-fetcher";
import type { PreparedTransaction } from "./transactions/internals/budget-runtime-builder";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("cancellation rejects a pending wallet read and blocks subsequent native reads", async () => {
  const controller = new AbortController();
  const pending = deferred<string>();
  let calls = 0;
  const wallet = createAbortableWalletSource({
    getChangeAddress: () => { calls++; return pending.promise; }
  } as WalletSource, controller.signal);
  const result = wallet.getChangeAddress();
  await Promise.resolve();
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  await assert.rejects(wallet.getChangeAddress(), { name: "AbortError" });
  pending.resolve("late address");
  assert.equal(calls, 1);
});

test("abortable retains normal results and failures", async () => {
  const signal = new AbortController().signal;
  assert.equal(await abortable(signal, async () => 42), 42);
  await assert.rejects(abortable(signal, async () => { throw new Error("failed read"); }), /failed read/);
});

test("canceling pending prepare prevents the draft build from starting", async () => {
  const controller = new AbortController();
  const pending = deferred<PreparedTransaction>();
  const started = deferred<void>();
  let draftBuilds = 0;
  const build = buildTransactionWithReestimatedLimits("draft", "final", () => { started.resolve(); return pending.promise; },
    new ServerFetcher({ signal: controller.signal }));
  await started.promise;
  controller.abort();
  pending.resolve({
    tx: { build: async () => { draftBuilds++; return "unused"; }, txBuilder: { meshTxBuilderBody: {} } },
    diagnostics: {}, signerAddress: "unused"
  } as unknown as PreparedTransaction);
  await assert.rejects(build, { name: "AbortError" });
  assert.equal(draftBuilds, 0);
});

test("canceling pending draft prevents re-estimation and later build work", async () => {
  const controller = new AbortController();
  const pending = deferred<string>();
  const started = deferred<void>();
  let prepares = 0;
  const build = buildTransactionWithReestimatedLimits("draft", "final", async () => {
    prepares++;
    return {
      tx: { build: () => { started.resolve(); return pending.promise; }, txBuilder: { meshTxBuilderBody: {} } },
      diagnostics: {}, signerAddress: "unused"
    } as unknown as PreparedTransaction;
  }, new ServerFetcher({ signal: controller.signal }));
  await started.promise;
  controller.abort();
  pending.resolve("invalid CBOR must never be read");
  await assert.rejects(build, { name: "AbortError" });
  assert.equal(prepares, 1);
});

test("canceled provider starts no RPC, including through build parameter wrapper", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("unexpected RPC"); });
  const controller = new AbortController();
  const fetcher = createBuildParameterFetcher(new ServerFetcher({ signal: controller.signal }));
  assert.equal(fetcher.signal, controller.signal);
  controller.abort();
  await assert.rejects(fetcher.fetchAddressUTxOs("addr_test1"), { name: "AbortError" });
  await assert.rejects(fetcher.fetchProtocolParameters(), { name: "AbortError" });
  assert.equal(calls, 0);
});


test("canceling setup stops pending wallet work after the parallel protocol request starts", async (t) => {
  let providerCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { providerCalls++; throw new Error("unexpected RPC"); });
  const controller = new AbortController();
  const started = deferred<void>();
  const pending = deferred<Awaited<ReturnType<WalletSource["getUtxos"]>>>();
  let laterWalletReads = 0;
  const wallet: WalletSource = {
    getUtxos: () => { started.resolve(); return pending.promise; },
    getChangeAddress: async () => { laterWalletReads++; return "unused"; },
    getUsedAddresses: async () => { laterWalletReads++; return []; },
    getUnusedAddresses: async () => { laterWalletReads++; return []; }
  };
  const setup = setupTransaction(wallet, Date.now(), new ServerFetcher({ signal: controller.signal }));
  await started.promise;
  controller.abort();
  await assert.rejects(setup, { name: "AbortError" });
  pending.resolve([]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(laterWalletReads, 0);
  assert.equal(providerCalls, 1);
});
