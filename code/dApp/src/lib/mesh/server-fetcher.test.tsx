import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";

// A .tsx file with no JSX in it: the two runners are split by extension, and
// src/lib/mesh is not in the node:test globs (see package.json).

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function answer(body: string, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
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
});
