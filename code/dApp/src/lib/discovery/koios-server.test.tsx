// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server-env", () => ({
  getServerEnv: () => ({ KOIOS_URL: "https://koios.example/api/v1" })
}));

import { fetchCredentialUtxosFromKoios } from "@/lib/discovery/koios-server";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("queries Koios directly from the server and maps credential UTxOs", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify([
        {
          tx_hash: "aa".repeat(32),
          tx_index: 2,
          address: "addr_test1wallet",
          value: "5000000",
          asset_list: [
            { policy_id: "bb".repeat(28), asset_name: "01", quantity: "3" }
          ]
        }
      ]),
      { status: 200 }
    )
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await fetchCredentialUtxosFromKoios("cc".repeat(28));

  expect(fetchMock).toHaveBeenCalledWith(
    "https://koios.example/api/v1/credential_utxos",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        _payment_credentials: ["cc".repeat(28)],
        _extended: true
      })
    })
  );
  expect(result).toEqual([
    {
      txHash: "aa".repeat(32),
      outputIndex: 2,
      address: "addr_test1wallet",
      lovelace: "5000000",
      assets: [{ unit: `${"bb".repeat(28)}01`, quantity: "3" }]
    }
  ]);
});

it("rejects malformed payment credentials before a provider request", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await expect(fetchCredentialUtxosFromKoios("bad")).rejects.toThrow(
    /56-character hex hash/
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
