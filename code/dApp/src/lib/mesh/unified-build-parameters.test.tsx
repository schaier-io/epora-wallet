// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import type { BlockfrostProvider } from "@meshsdk/core";
import { ServerFetcher } from "./server-fetcher";
import { createServerTxFetcher } from "./server-wallet";
import { beginBuildPass, createBuildParameterFetcher } from "./transactions/internals/build-parameter-fetcher";
import { createOfflineBuildParameters } from "./transactions/offline-evaluation-mint-fixture";
import { BUILD_PARAMETER_CACHE_MS, parseBuildParameters, protocolFromBuildParameters } from "./protocol-parameter-cache";

const configured = vi.hoisted(() => ({ provider: undefined as unknown as BlockfrostProvider }));
vi.mock("./blockfrost-server", () => ({ getBlockfrostProvider: () => configured.provider }));

function snapshot(epoch = 600) {
  return { epoch, protocol_major_ver: 10, protocol_minor_ver: 0, min_fee_a: 23,
    cost_models_raw: { PlutusV1: [1, -2], PlutusV2: [3, 4], PlutusV3: [5, 6] } };
}
const models = [[1, -2], [3, 4], [5, 6]];
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // Return a new Response for each request because real bodies are consumed once.
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ result: snapshot() }))));
  vi.stubGlobal("fetch", fetchMock);
});

class Provider {
  #epoch = 600;
  paths: string[] = [];
  parameterEpochs: (number | undefined)[] = [];
  modelEpochs: (number | undefined)[] = [];
  async get(path: string) { this.paths.push(path); return snapshot(this.#epoch); }
  async fetchProtocolParameters(epoch?: number) {
    this.parameterEpochs.push(epoch);
    return { ...DEFAULT_PROTOCOL_PARAMETERS, epoch: epoch ?? this.#epoch };
  }
  async fetchCostModels(epoch?: number) { this.modelEpochs.push(epoch); return models; }
  async fetchUTxOs() { return []; }
  async evaluateTx() { return []; }
}

function serverProvider() {
  const source = new Provider();
  configured.provider = source as unknown as BlockfrostProvider;
  return source;
}

async function latestReads(fetcher: ReturnType<typeof createBuildParameterFetcher>) {
  return Promise.all([fetcher.fetchProtocolParameters(), fetcher.fetchCostModels(), fetcher.get("epochs/latest/parameters")]);
}

describe("one protocol snapshot per transaction build", () => {
  it("retains configured fixture protocol fields and models in the raw snapshot", () => {
    const protocol = { ...DEFAULT_PROTOCOL_PARAMETERS, epoch: 700, minFeeA: 55, collateralPercent: 175, maxTxExSteps: "8000000000" };
    const raw = createOfflineBuildParameters(protocol, models);
    expect(protocolFromBuildParameters(parseBuildParameters(raw))).toEqual(protocol);
    expect(raw.cost_models_raw).toEqual({ PlutusV1: models[0], PlutusV2: models[1], PlutusV3: models[2] });
  });
  it("shares browser typed, model and raw reads across passes with isolated values", async () => {
    const source = new ServerFetcher();
    const build = createBuildParameterFetcher(source);
    const [parameters, costs, raw] = await latestReads(build);
    expect(parameters).toEqual({ ...DEFAULT_PROTOCOL_PARAMETERS, epoch: 600, minFeeA: 23 });
    expect(costs).toEqual(models);
    expect(raw).toEqual(snapshot());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ method: "get", args: ["epochs/latest/parameters", true] });
    parameters.minFeeA = 99;
    costs[0]![0] = 99;
    (raw as ReturnType<typeof snapshot>).cost_models_raw.PlutusV1[0] = 99;
    beginBuildPass(build);
    const repeated = await latestReads(build);
    expect(repeated[0].minFeeA).toBe(23);
    expect(repeated[1]).toEqual(models);
    expect(repeated[2]).toEqual(snapshot());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts a new browser snapshot for each build and leaves signing raw reads fresh", async () => {
    const source = new ServerFetcher();
    await latestReads(createBuildParameterFetcher(source));
    await latestReads(createBuildParameterFetcher(source));
    await source.get("epochs/latest/parameters");
    await source.get("epochs/latest/parameters");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const payloads = fetchMock.mock.calls.map((call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as { args: unknown[] });
    expect(payloads.map(payload => payload.args)).toEqual([
      ["epochs/latest/parameters", true], ["epochs/latest/parameters", true],
      ["epochs/latest/parameters"], ["epochs/latest/parameters"]
    ]);
  });

  it("delegates explicit browser epochs through the original RPC methods", async () => {
    const build = createBuildParameterFetcher(new ServerFetcher());
    await build.fetchProtocolParameters(0);
    await build.fetchCostModels(0);
    await build.fetchProtocolParameters(123);
    await build.fetchCostModels(123);
    const payloads = fetchMock.mock.calls.map((call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as { method: string; args: unknown[] });
    expect(payloads).toEqual([
      { method: "fetchProtocolParameters", args: [0] }, { method: "fetchCostModels", args: [0] },
      { method: "fetchProtocolParameters", args: [123] }, { method: "fetchCostModels", args: [123] }
    ]);
  });

  it("retries a failed browser snapshot without retaining mapped defaults", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ result: { epoch: "bad" } }))));
    const build = createBuildParameterFetcher(new ServerFetcher());
    const failed = await Promise.allSettled([build.fetchProtocolParameters(), build.fetchCostModels(), build.get("epochs/latest/parameters")]);
    expect(failed.map(result => result.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [protocol, costs] = await latestReads(build);
    expect(protocol.minFeeA).toBe(23);
    expect(costs).toEqual(models);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a stable server adapter and one upstream snapshot across concurrent build reads", async () => {
    const source = serverProvider();
    const first = createServerTxFetcher();
    expect(createServerTxFetcher()).toBe(first);
    const [protocol, costs, raw] = await latestReads(createBuildParameterFetcher(first));
    expect(protocol.minFeeA).toBe(23);
    expect(costs).toEqual(models);
    expect(raw).toEqual(snapshot());
    expect(source.paths).toEqual(["epochs/latest/parameters"]);
    expect(source.parameterEpochs).toEqual([]);
    expect(source.modelEpochs).toEqual([]);
    await latestReads(createBuildParameterFetcher(createServerTxFetcher()));
    expect(source.paths).toHaveLength(1);
    await first.get("epochs/latest/parameters");
    await first.get("epochs/latest/parameters");
    expect(source.paths).toHaveLength(3);
  });

  it("retains provider receivers and explicit server epochs without reading latest", async () => {
    const source = serverProvider();
    const fetcher = createBuildParameterFetcher(createServerTxFetcher());
    expect((await fetcher.fetchProtocolParameters(0)).epoch).toBe(0);
    await fetcher.fetchCostModels(0);
    expect((await fetcher.fetchProtocolParameters(123)).epoch).toBe(123);
    await fetcher.fetchCostModels(123);
    expect(source.parameterEpochs).toEqual([0, 123]);
    expect(source.modelEpochs).toEqual([0, 123]);
    expect(source.paths).toEqual([]);
  });

  it("refreshes expired server snapshots and separates configured providers", async () => {
    let now = 1_000;
    const date = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const first = serverProvider();
      await latestReads(createBuildParameterFetcher(createServerTxFetcher()));
      now += BUILD_PARAMETER_CACHE_MS;
      await latestReads(createBuildParameterFetcher(createServerTxFetcher()));
      expect(first.paths).toHaveLength(2);
      const second = serverProvider();
      await latestReads(createBuildParameterFetcher(createServerTxFetcher()));
      expect(second.paths).toHaveLength(1);
    } finally { date.mockRestore(); }
  });
});
