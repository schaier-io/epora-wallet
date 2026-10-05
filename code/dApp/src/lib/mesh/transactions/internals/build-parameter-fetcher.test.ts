import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import { beginBuildPass, createBuildParameterFetcher } from "./build-parameter-fetcher";

function provider() {
  class Provider {
    #models = [[1, 2], [3, 4]];
    parameterEpochs: (number | undefined)[] = [];
    modelEpochs: (number | undefined)[] = [];
    gets: string[] = [];
    evaluations: string[] = [];
    inputReads = 0;
    addressReads: [string, string | undefined][] = [];

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

    async fetchAddressUTxOs(address: string, asset?: string) {
      this.addressReads.push([address, asset]);
      return [{ input: { txHash: address, outputIndex: 0 }, output: { address, amount: [{ unit: "lovelace", quantity: "1" }] } }];
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

test("freshness checks stay live between passes while input metadata is reused", async () => {
  const { source, fetcher } = provider();
  const scoped = createBuildParameterFetcher(fetcher);
  const get = scoped.get;
  for (let pass = 0; pass < 2; pass += 1) {
    beginBuildPass(scoped);
    assert.deepEqual(await get("txs/hash/utxos"), { request: pass === 0 ? 1 : 3, costs: [[1, 2], [3, 4]] });
    await get("epochs/latest/parameters");
    await scoped.fetchUTxOs("hash");
    await scoped.evaluateTx("tx");
  }
  assert.equal(source.gets.length, 3);
  assert.equal(source.inputReads, 1);
  assert.deepEqual(source.evaluations, ["tx", "tx"]);
});

test("address UTxO reads are shared per address and asset within one build", async () => {
  const { source, fetcher } = provider();
  const scoped = createBuildParameterFetcher(fetcher);
  const [first, second] = await Promise.all([
    scoped.fetchAddressUTxOs("addr_a"), scoped.fetchAddressUTxOs("addr_a")
  ]);
  first[0]!.output.amount[0]!.quantity = "99";
  assert.equal(second[0]!.output.amount[0]!.quantity, "1");
  assert.equal((await scoped.fetchAddressUTxOs("addr_a"))[0]!.output.amount[0]!.quantity, "1");
  await scoped.fetchAddressUTxOs("addr_a", "unit");
  await scoped.fetchAddressUTxOs("addr_b");
  assert.deepEqual(source.addressReads, [["addr_a", undefined], ["addr_a", "unit"], ["addr_b", undefined]]);

  await createBuildParameterFetcher(fetcher).fetchAddressUTxOs("addr_a");
  assert.equal(source.addressReads.length, 4);
});

test("rejected address reads retry instead of poisoning the final pass", async () => {
  const { fetcher } = provider();
  let calls = 0;
  fetcher.fetchAddressUTxOs = async () => {
    if (++calls === 1) throw new Error("address unavailable");
    return [];
  };
  const scoped = createBuildParameterFetcher(fetcher);
  await assert.rejects(scoped.fetchAddressUTxOs("addr"), /address unavailable/);
  await scoped.fetchAddressUTxOs("addr");
  await scoped.fetchAddressUTxOs("addr");
  assert.equal(calls, 2);
});


test("raw latest parameters share one build snapshot and retry failures", async () => {
  const { fetcher } = provider();
  let calls = 0;
  fetcher.get = async () => {
    if (++calls === 1) throw new Error("raw parameters unavailable");
    return { cost_models_raw: { PlutusV3: [1, 2] } };
  };
  const scoped = createBuildParameterFetcher(fetcher);
  await assert.rejects(scoped.get("epochs/latest/parameters"), /raw parameters unavailable/);
  const [first, second] = await Promise.all([
    scoped.get("epochs/latest/parameters"), scoped.get("epochs/latest/parameters")
  ]) as { cost_models_raw: { PlutusV3: number[] } }[];
  first.cost_models_raw.PlutusV3[0] = 99;
  assert.equal(second.cost_models_raw.PlutusV3[0], 1);
  assert.equal(calls, 2);
  await createBuildParameterFetcher(fetcher).get("epochs/latest/parameters");
  assert.equal(calls, 3);
});


test("status responses share one transaction within a pass and refresh for the final pass", async () => {
  const { source, fetcher } = provider();
  const scoped = createBuildParameterFetcher(fetcher);
  const path = `txs/${"ab".repeat(32)}/utxos`;
  const [first, second] = await Promise.all([scoped.get(path), scoped.get(path)]);
  assert.deepEqual(first, second);
  await scoped.get(path);
  assert.equal(source.gets.length, 1);
  beginBuildPass(scoped);
  await scoped.get(path);
  assert.equal(source.gets.length, 2);
  await createBuildParameterFetcher(fetcher).get(path);
  assert.equal(source.gets.length, 3);
});

test("input metadata is cloned, scoped to one build, and retries failures", async () => {
  const { fetcher } = provider();
  let calls = 0;
  fetcher.fetchUTxOs = async () => {
    if (++calls === 1) throw new Error("metadata unavailable");
    return [{ input: { txHash: "ab".repeat(32), outputIndex: 0 },
      output: { address: "address", amount: [{ unit: "lovelace", quantity: "1" }] } }];
  };
  const scoped = createBuildParameterFetcher(fetcher);
  await assert.rejects(scoped.fetchUTxOs("hash", 0), /metadata unavailable/);
  const first = await scoped.fetchUTxOs("hash", 0);
  first[0].output.amount[0].quantity = "99";
  beginBuildPass(scoped);
  assert.equal((await scoped.fetchUTxOs("hash", 0))[0].output.amount[0].quantity, "1");
  assert.equal(calls, 2);
  await scoped.fetchUTxOs("hash", 1);
  await createBuildParameterFetcher(fetcher).fetchUTxOs("hash", 0);
  assert.equal(calls, 4);
});

test("failed status reads retry within their own pass", async () => {
  const { fetcher } = provider();
  let calls = 0;
  fetcher.get = async () => { if (++calls === 1) throw new Error("offline"); return { outputs: [] }; };
  const scoped = createBuildParameterFetcher(fetcher);
  const path = `txs/${"ab".repeat(32)}/utxos`;
  await assert.rejects(scoped.get(path), /offline/);
  await scoped.get(path);
  assert.equal(calls, 2);
});

test("identical evaluation candidates share work but own their budgets", async () => {
  const { fetcher } = provider();
  let calls = 0;
  const result = [{ tag: "SPEND" as const, index: 0, budget: { mem: 1, steps: 2 } }];
  fetcher.evaluateTx = async () => { calls++; return result; };
  const scoped = createBuildParameterFetcher(fetcher);
  const [first, second] = await Promise.all([scoped.evaluateTx("tx"), scoped.evaluateTx("tx")]);
  first[0].budget.mem = 99;
  result[0].budget.steps = 99;
  assert.equal(second[0].budget.mem, 1);
  assert.equal((await scoped.evaluateTx("tx"))[0].budget.steps, 2);
  assert.equal(calls, 1);
});

test("evaluation reuse includes exact bytes, context, and each build pass", async () => {
  const { source, fetcher } = provider();
  const scoped = createBuildParameterFetcher(fetcher);
  const output = { input: { txHash: "ab".repeat(32), outputIndex: 0 },
    output: { address: "address", amount: [{ unit: "lovelace", quantity: "1" }] } };
  await scoped.evaluateTx("tx", [output], []);
  await scoped.evaluateTx("tx", structuredClone([output]), []);
  await scoped.evaluateTx("different-tx", [output], []);
  await scoped.evaluateTx("tx", [output], []);
  output.output.amount[0].quantity = "2";
  await scoped.evaluateTx("tx", [output], []);
  await scoped.evaluateTx("tx", [output], ["chained"]);
  await scoped.evaluateTx("tx", [output], ["other-chained"]);
  assert.equal(source.evaluations.length, 5);
  beginBuildPass(scoped);
  await scoped.evaluateTx("tx", [output], ["other-chained"]);
  await scoped.evaluateTx("tx", [output], ["other-chained"]);
  await createBuildParameterFetcher(fetcher).evaluateTx("tx", [output], ["other-chained"]);
  assert.equal(source.evaluations.length, 7);
});

test("an old pass rejection cannot evict the same request from the final pass", async () => {
  const { fetcher } = provider();
  let rejectDraft!: (error: Error) => void;
  let calls = 0;
  fetcher.evaluateTx = async () => {
    if (++calls === 1) return new Promise((_, reject) => { rejectDraft = reject; });
    return [];
  };
  const scoped = createBuildParameterFetcher(fetcher);
  const failedDraft = assert.rejects(scoped.evaluateTx("same"), /draft unavailable/);
  beginBuildPass(scoped);
  await scoped.evaluateTx("same");
  rejectDraft(new Error("draft unavailable"));
  await failedDraft;
  await scoped.evaluateTx("other");
  await scoped.evaluateTx("same");
  assert.equal(calls, 3);
});

test("evaluation reuse keeps recent candidates and bounds retained requests", async () => {
  const { source, fetcher } = provider();
  const scoped = createBuildParameterFetcher(fetcher);
  const retainedRequestLimit = 64;
  for (let candidate = 0; candidate <= retainedRequestLimit; candidate++) {
    await scoped.evaluateTx(`candidate-${candidate}`);
  }
  await scoped.evaluateTx("candidate-1");
  assert.equal(source.evaluations.length, retainedRequestLimit + 1);
  await scoped.evaluateTx("candidate-0");
  assert.equal(source.evaluations.length, retainedRequestLimit + 2, "the oldest request must have been evicted");
});

test("rejected evaluation candidates retry without evicting a newer candidate", async () => {
  const { fetcher } = provider();
  let rejectOld!: (error: Error) => void;
  let calls = 0;
  fetcher.evaluateTx = async tx => {
    calls++;
    if (tx === "old" && calls === 1) return new Promise((_, reject) => { rejectOld = reject; });
    return [];
  };
  const scoped = createBuildParameterFetcher(fetcher);
  const old = scoped.evaluateTx("old");
  const failure = assert.rejects(old, /offline/);
  await scoped.evaluateTx("new");
  rejectOld(new Error("offline"));
  await failure;
  await scoped.evaluateTx("new");
  assert.equal(calls, 2);
  await scoped.evaluateTx("old");
  assert.equal(calls, 3);
});

test("cancelled evaluation results cannot be read from the cache", async () => {
  const { fetcher } = provider();
  const controller = new AbortController();
  Object.defineProperty(fetcher, "signal", { value: controller.signal });
  let resolve!: (result: []) => void;
  let calls = 0;
  fetcher.evaluateTx = async () => { calls++; return new Promise(done => { resolve = done; }); };
  const scoped = createBuildParameterFetcher(fetcher);
  const pending = scoped.evaluateTx("tx");
  const rejected = assert.rejects(pending, { name: "AbortError" });
  controller.abort();
  resolve([]);
  await rejected;
  await assert.rejects(scoped.evaluateTx("tx"), { name: "AbortError" });
  assert.equal(calls, 1);
  await createBuildParameterFetcher(provider().fetcher).evaluateTx("tx");
});

test("evaluation context remains the exact snapshot used for its cache key", async () => {
  const { fetcher } = provider();
  const output = { input: { txHash: "ab".repeat(32), outputIndex: 0 },
    output: { address: "address", amount: [{ unit: "lovelace", quantity: "1" }] } };
  const chained = ["original"];
  const expected = structuredClone([output]);
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  fetcher.evaluateTx = async (_, inputs, transactions) => {
    await waiting;
    assert.deepEqual(inputs, expected);
    assert.deepEqual(transactions, ["original"]);
    return [];
  };
  const scoped = createBuildParameterFetcher(fetcher);
  const pending = scoped.evaluateTx("tx", [output], chained);
  output.output.amount[0].quantity = "changed";
  chained[0] = "changed";
  finish();
  await pending;
  await scoped.evaluateTx("tx", expected, ["original"]);
});
