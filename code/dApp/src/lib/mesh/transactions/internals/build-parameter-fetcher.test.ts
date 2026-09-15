import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import { createBuildParameterFetcher } from "./build-parameter-fetcher";

function provider() {
  class Provider {
    #models = [[1, 2], [3, 4]];
    parameterEpochs: (number | undefined)[] = [];
    modelEpochs: (number | undefined)[] = [];
    gets: string[] = [];
    evaluations: string[] = [];
    inputReads = 0;

    async fetchProtocolParameters(epoch?: number) {
      this.parameterEpochs.push(epoch);
      return DEFAULT_PROTOCOL_PARAMETERS;
    }

    async fetchCostModels(epoch?: number) {
      this.modelEpochs.push(epoch);
      return this.#models;
    }

    async get(url: string) {
      this.gets.push(url);
      return { request: this.gets.length, costs: this.#models };
    }

    async evaluateTx(tx: string) {
      this.evaluations.push(tx);
      return [];
    }

    async fetchUTxOs() {
      this.inputReads += 1;
      return [];
    }
  }

  const source = new Provider();
  return { source, fetcher: source as unknown as TxFetcher };
}

test("shares concurrent latest reads and isolates returned parameter values", async () => {
  const { source, fetcher } = provider();
  const scoped = createBuildParameterFetcher(fetcher);
  const [first, second] = await Promise.all([
    scoped.fetchProtocolParameters(), scoped.fetchProtocolParameters()
  ]);
  assert.deepEqual(source.parameterEpochs, [undefined]);
  first.minFeeA += 1;
  assert.equal(second.minFeeA, DEFAULT_PROTOCOL_PARAMETERS.minFeeA);
  assert.equal((await scoped.fetchProtocolParameters()).minFeeA, second.minFeeA);

  const [firstModels, secondModels] = await Promise.all([
    scoped.fetchCostModels(), scoped.fetchCostModels()
  ]);
  firstModels[0][0] = 99;
  assert.equal(secondModels[0][0], 1);
  assert.equal((await scoped.fetchCostModels())[0][0], 1);
  assert.deepEqual(source.modelEpochs, [undefined]);
});

test("separate scopes read independently even with one shared provider", async () => {
  const { source, fetcher } = provider();
  const scopes = [createBuildParameterFetcher(fetcher), createBuildParameterFetcher(fetcher)];
  await Promise.all(scopes.flatMap((scope) => [
    scope.fetchProtocolParameters(), scope.fetchCostModels()
  ]));
  assert.deepEqual(source.parameterEpochs, [undefined, undefined]);
  assert.deepEqual(source.modelEpochs, [undefined, undefined]);
});

test("explicit epochs bypass latest caches and retain the provider receiver", async () => {
  const { source, fetcher } = provider();
  const scoped = createBuildParameterFetcher(fetcher);
  for (const epoch of [undefined, 0, 123, 123, Number.NaN, undefined]) {
    await scoped.fetchProtocolParameters(epoch);
    await scoped.fetchCostModels(epoch);
  }
  assert.deepEqual(source.parameterEpochs, [undefined, 0, 123, 123, Number.NaN]);
  assert.deepEqual(source.modelEpochs, source.parameterEpochs);
});

test("rejected latest reads retry instead of poisoning later passes", async () => {
  const { fetcher } = provider();
  let parameterCalls = 0;
  let modelCalls = 0;
  fetcher.fetchProtocolParameters = async () => {
    if (++parameterCalls === 1) throw new Error("parameters unavailable");
    return DEFAULT_PROTOCOL_PARAMETERS;
  };
  fetcher.fetchCostModels = async () => {
    if (++modelCalls === 1) throw new Error("models unavailable");
    return [[1]];
  };
  const scoped = createBuildParameterFetcher(fetcher);
  await assert.rejects(scoped.fetchProtocolParameters(), /parameters unavailable/);
  await assert.rejects(scoped.fetchCostModels(), /models unavailable/);
  await scoped.fetchProtocolParameters();
  await scoped.fetchProtocolParameters();
  await scoped.fetchCostModels();
  await scoped.fetchCostModels();
  assert.equal(parameterCalls, 2);
  assert.equal(modelCalls, 2);
});

test("empty or invalid cost models allow the next pass to retry", async () => {
  for (const invalid of [[], undefined, null, {}]) {
    const { fetcher } = provider();
    let calls = 0;
    fetcher.fetchCostModels = async () => {
      calls += 1;
      return calls === 1 ? invalid as number[][] : [[1]];
    };
    const scoped = createBuildParameterFetcher(fetcher);
    assert.deepEqual(await scoped.fetchCostModels(), invalid);
    assert.deepEqual(await scoped.fetchCostModels(), [[1]]);
    assert.deepEqual(await scoped.fetchCostModels(), [[1]]);
    assert.equal(calls, 2);
  }
});

test("freshness reads and evaluation remain uncached and bound to the provider", async () => {
  const { source, fetcher } = provider();
  const scoped = createBuildParameterFetcher(fetcher);
  const get = scoped.get;
  for (let pass = 0; pass < 2; pass += 1) {
    assert.deepEqual(await get("txs/hash/utxos"), { request: pass * 2 + 1, costs: [[1, 2], [3, 4]] });
    await get("epochs/latest/parameters");
    await scoped.fetchUTxOs("hash");
    await scoped.evaluateTx("tx");
  }
  assert.equal(source.gets.length, 4);
  assert.equal(source.inputReads, 2);
  assert.deepEqual(source.evaluations, ["tx", "tx"]);
});
