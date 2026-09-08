import { beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
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
