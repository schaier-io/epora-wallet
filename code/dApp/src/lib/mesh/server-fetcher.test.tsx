import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBuildParameterFetcher } from "./transactions/internals/build-parameter-fetcher";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function answer(body: string, status: number, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    // A real Response rejects its json() promise, it does not throw at the call.
    json: () => new Promise<unknown>((resolve) => resolve(JSON.parse(body)))
  };
}

describe("mesh RPC failures", () => {
  it("sends the method hint and reports timings without transaction contents", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      fetchMock.mockResolvedValue(answer('{"result":[]}', 200, {
        "Server-Timing": "rate_limit;dur=3.2, provider;dur=12.1, total;dur=16.0"
      }));
      await new ServerFetcher().evaluateTx("private-transaction");
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(new Headers(init.headers).get("X-Mesh-Method")).toBe("evaluateTx");
      expect(debug).toHaveBeenCalledWith("[mesh-rpc:timings]", expect.objectContaining({
        method: "evaluateTx", status: 200,
        serverTiming: "rate_limit;dur=3.2, provider;dur=12.1, total;dur=16.0"
      }));
      expect(JSON.stringify(debug.mock.calls)).not.toContain("private-transaction");
    } finally { debug.mockRestore(); }
  });

  it("reports the status when the proxy answers with a page instead of JSON", async () => {
    // A 502 from a gateway carries an HTML body. Parsing it first threw
    // `SyntaxError: Unexpected token '<'`, which named nothing the reader or
    // the log could act on.
    fetchMock.mockResolvedValue(answer("<html>Bad Gateway</html>", 502));

    await expect(new ServerFetcher().fetchAccountInfo("addr_test1")).rejects.toThrow(
      "Mesh RPC call failed for fetchAccountInfo (HTTP 502)"
    );
  });

  it("still names a malformed body that arrived with a good status", async () => {
    fetchMock.mockResolvedValue(answer("null", 200));

    await expect(new ServerFetcher().fetchAccountInfo("addr_test1")).rejects.toThrow(
      "Mesh RPC call returned malformed payload for fetchAccountInfo"
    );
  });

  it("passes the server's own error message through", async () => {
    fetchMock.mockResolvedValue(answer('{"error":"Blockfrost key missing"}', 500));

    await expect(new ServerFetcher().fetchAccountInfo("addr_test1")).rejects.toThrow(
      "Blockfrost key missing"
    );
  });

  it("returns the result of a good call", async () => {
    fetchMock.mockResolvedValue(answer('{"result":{"balance":"1"}}', 200));

    await expect(new ServerFetcher().fetchAccountInfo("addr_test1")).resolves.toEqual({
      balance: "1"
    });
  });

  it("exposes the status and retry delay without changing provider text", async () => {
    fetchMock.mockResolvedValue(answer(
      '{"error":"Upstream busy","details":{"message":"ledger detail"}}',
      429,
      { "Retry-After": "12" }
    ));

    await expect(new ServerFetcher().get("epochs/latest/parameters")).rejects.toMatchObject({
      name: "MeshRpcError",
      status: 429,
      retryAfterMs: 12_000,
      message: 'Upstream busy\n{\n  "message": "ledger detail"\n}'
    });
  });

  it("retains gateway status on non-JSON errors", async () => {
    fetchMock.mockResolvedValue(answer("<html>Bad Gateway</html>", 502));
    await expect(new ServerFetcher().fetchAccountInfo("addr_test1")).rejects.toMatchObject({
      name: "MeshRpcError", status: 502
    });
  });

  it("passes query cancellation through to fetch and preserves its abort error", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const read = new ServerFetcher({ signal: controller.signal }).fetchAddressUTxOs("addr_test1");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not turn cancellation while reading the body into a malformed payload error", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      json: async () => { controller.abort(); throw controller.signal.reason; }
    });
    await expect(new ServerFetcher({ signal: controller.signal }).get("anything")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("supports date retry headers and ignores negative or unbounded delays", async () => {
    const now = new Date("2026-09-08T12:00:00Z").valueOf();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      fetchMock.mockResolvedValue(answer('{"error":"busy"}', 503, { "Retry-After": "Tue, 08 Sep 2026 12:00:20 GMT" }));
      await expect(new ServerFetcher().get("anything")).rejects.toMatchObject({ retryAfterMs: 20_000 });
      for (const header of ["-1", "1e307", "invalid"]) {
        fetchMock.mockResolvedValue(answer('{"error":"busy"}', 503, { "Retry-After": header }));
        await expect(new ServerFetcher().get("anything")).rejects.toMatchObject({ retryAfterMs: undefined });
      }
    } finally {
      clock.mockRestore();
    }
  });
});

describe("safe read transport recovery", () => {
  it("recovers a temporary transport failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(answer('{"result":[]}', 200));
    await expect(new ServerFetcher().fetchUTxOs("00", 0)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("limits persistent transport failures to three attempts", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(new ServerFetcher().get("txs/00/utxos")).rejects.toThrow("Failed to fetch");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["submitTx", "evaluateTx"] as const)("does not retry %s transport failures", async (method) => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(new ServerFetcher()[method]("00")).rejects.toThrow("Failed to fetch");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry an HTTP failure", async () => {
    fetchMock.mockResolvedValue(answer('{"error":"busy"}', 503));
    await expect(new ServerFetcher().fetchUTxOs("00")).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("does not retry a non-transport TypeError", async () => {
  const circular: Record<string, unknown> = {};
  circular.value = circular;
  await expect(new ServerFetcher().fetchAddressTxs("address", circular))
    .rejects.toBeInstanceOf(TypeError);
  expect(fetchMock).not.toHaveBeenCalled();
});


it("only the build wrapper opts raw parameters into the server cache", async () => {
  fetchMock.mockResolvedValue(answer('{"result":{"epoch":600,"protocol_major_ver":10,"protocol_minor_ver":0,"cost_models_raw":{"PlutusV3":[1]}}}', 200));
  const fetcher = new ServerFetcher();
  await createBuildParameterFetcher(fetcher).get("epochs/latest/parameters");
  await fetcher.get("epochs/latest/parameters");
  const bodies = fetchMock.mock.calls.map((call: unknown[]) => {
    const init = call[1] as RequestInit;
    return JSON.parse(init.body as string) as { args: unknown[] };
  });
  expect(bodies.map(body => body.args)).toEqual([
    ["epochs/latest/parameters", true], ["epochs/latest/parameters"]
  ]);
});
