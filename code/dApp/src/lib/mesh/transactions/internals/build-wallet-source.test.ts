import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import type { WalletSource } from "@/lib/mesh/tx-context";
import { createBuildParameterFetcher, resolveBuildWalletSource } from "./build-parameter-fetcher";
import { createBuildWalletSource } from "./build-wallet-source";
import { setupTransaction } from "./core";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";

function fixture() {
  const calls = { utxos: 0, change: 0, used: 0, unused: 0 };
  const wallet: WalletSource = {
    getUtxos: async () => {
      calls.utxos++;
      return [{ input: { txHash: "11".repeat(32), outputIndex: 0 }, output: {
        address: ADDRESS, amount: [{ unit: "lovelace", quantity: "100000000" }]
      } }];
    },
    getChangeAddress: async () => { calls.change++; return ADDRESS; },
    getUsedAddresses: async () => { calls.used++; return [ADDRESS]; },
    getUnusedAddresses: async () => { calls.unused++; return []; }
  };
  const fetcher = new ServerFetcher();
  fetcher.fetchProtocolParameters = async () => DEFAULT_PROTOCOL_PARAMETERS;
  return { wallet, calls, fetcher };
}

test("build wallet shares concurrent reads and gives each pass independent values", async () => {
  const { wallet, calls } = fixture();
  const scoped = createBuildWalletSource(wallet);
  const [first, second] = await Promise.all([scoped.getUtxos(), scoped.getUtxos()]);
  first[0]!.output.amount[0]!.quantity = "0";
  assert.equal(second[0]!.output.amount[0]!.quantity, "100000000");
  assert.equal((await scoped.getUtxos())[0]!.output.amount[0]!.quantity, "100000000");
  for (let pass = 0; pass < 2; pass++) {
    await scoped.getChangeAddress();
    (await scoped.getUsedAddresses()).pop();
    await scoped.getUnusedAddresses();
  }
  assert.deepEqual(await scoped.getUsedAddresses(), [ADDRESS]);
  assert.deepEqual(calls, { utxos: 1, change: 1, used: 1, unused: 1 });
});

test("wallet failures retry instead of poisoning later reads", async () => {
  const { wallet } = fixture();
  let attempts = 0;
  wallet.getUsedAddresses = async () => {
    if (++attempts === 1) throw new Error("wallet read failed");
    return [ADDRESS];
  };
  const scoped = createBuildWalletSource(wallet);
  await assert.rejects(scoped.getUsedAddresses(), /wallet read failed/);
  assert.deepEqual(await scoped.getUsedAddresses(), [ADDRESS]);
  await scoped.getUsedAddresses();
  assert.equal(attempts, 2);

});

test("setup shares wallet reads only inside one build and one wallet", async () => {
  const { wallet, calls, fetcher } = fixture();
  const scoped = createBuildParameterFetcher(fetcher);
  await setupTransaction(wallet, undefined, scoped);
  await setupTransaction(wallet, undefined, scoped);
  assert.deepEqual(calls, { utxos: 1, change: 1, used: 1, unused: 0 });
  await setupTransaction(wallet, undefined, createBuildParameterFetcher(fetcher));
  assert.deepEqual(calls, { utxos: 2, change: 2, used: 2, unused: 0 });
  const other = fixture();
  await setupTransaction(other.wallet, undefined, scoped);
  assert.equal(other.calls.utxos, 1);
  assert.equal(resolveBuildWalletSource(fetcher, wallet), wallet);
});

test("protocol parameters start while wallet inputs are still pending", async () => {
  const { wallet, fetcher } = fixture();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const originalRead = wallet.getUtxos;
  let protocolStarted = false;
  wallet.getUtxos = async () => { await pending; return originalRead(); };
  fetcher.fetchProtocolParameters = async () => {
    protocolStarted = true;
    return DEFAULT_PROTOCOL_PARAMETERS;
  };
  const setup = setupTransaction(wallet, undefined, fetcher);
  try { assert.equal(protocolStarted, true); } finally { release(); }
  await setup;
});

test("early protocol errors retain their configure stage and wallet diagnostics", async () => {
  const { wallet, fetcher } = fixture();
  fetcher.fetchProtocolParameters = async () => { throw new Error("parameters unavailable"); };
  await assert.rejects(setupTransaction(wallet, undefined, fetcher), (error: unknown) => {
    assert.match(String(error), /parameters unavailable/);
    assert.equal((error as { stage: string }).stage, "setup:configureTx");
    return true;
  });
});

test("canceling a build blocks later reads and a new build reads the wallet again", async () => {
  const { wallet, calls, fetcher } = fixture();
  const controller = new AbortController();
  const canceledFetcher = new ServerFetcher({ signal: controller.signal });
  canceledFetcher.fetchProtocolParameters = fetcher.fetchProtocolParameters;
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const reading = new Promise<void>((resolve) => { started = resolve; });
  const originalRead = wallet.getUtxos;
  let attempts = 0;
  wallet.getUtxos = async () => {
    if (++attempts === 1) { started(); await pending; }
    return originalRead();
  };
  const scoped = createBuildParameterFetcher(canceledFetcher);
  const setup = setupTransaction(wallet, undefined, scoped);
  await reading;
  controller.abort();
  await assert.rejects(setup, { name: "AbortError" });
  release();
  await assert.rejects(setupTransaction(wallet, undefined, scoped), { name: "AbortError" });
  assert.equal(calls.change, 0);
  await setupTransaction(wallet, undefined, createBuildParameterFetcher(fetcher));
  assert.equal(attempts, 2);
  assert.equal(calls.change, 1);
});
