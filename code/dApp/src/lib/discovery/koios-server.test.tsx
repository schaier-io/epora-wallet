// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/env/server-env", () => ({
  getServerEnv: () => ({ KOIOS_URL: "https://koios.example/api/v1" })
}));

import { fetchCredentialUtxosFromKoios } from "@/lib/discovery/koios-server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
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

// A transient upstream outage must not fail a credential lookup that can recover.
it.each([502, 503, 504])("recovers after upstream HTTP %s", async (status) => {
  vi.useFakeTimers();
  const unavailable = new Response("Service Unavailable", { status });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(unavailable)
    .mockResolvedValueOnce(new Response("[]"));
  vi.stubGlobal("fetch", fetchMock);

  const result = expect(fetchCredentialUtxosFromKoios("cc".repeat(28))).resolves.toEqual([]);
  await Promise.all([result, vi.runAllTimersAsync()]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(unavailable.bodyUsed).toBe(true);
  expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
});

it("stops after three attempts and preserves the final upstream failure", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockImplementation(async () =>
    new Response("Service Unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);

  const result = expect(fetchCredentialUtxosFromKoios("cc".repeat(28)))
    .rejects.toThrow("Koios credential_utxos failed (503): Service Unavailable");
  await Promise.all([result, vi.runAllTimersAsync()]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it.each([400, 401, 404, 429])("does not retry HTTP %s", async (status) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("Rejected", { status }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(fetchCredentialUtxosFromKoios("cc".repeat(28)))
    .rejects.toThrow(`failed (${status})`);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not retry earlier than a long upstream Retry-After", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("Unavailable", {
    status: 503, headers: { "Retry-After": "60" }
  }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(fetchCredentialUtxosFromKoios("cc".repeat(28)))
    .rejects.toThrow("failed (503)");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("waits for a short upstream Retry-After before retrying", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response("Unavailable", {
      status: 503, headers: { "Retry-After": "1" }
    }))
    .mockResolvedValueOnce(new Response("[]"));
  vi.stubGlobal("fetch", fetchMock);
  const result = fetchCredentialUtxosFromKoios("cc".repeat(28));
  await vi.advanceTimersByTimeAsync(999);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("does not start another attempt after the shared deadline expires", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  const fetchMock = vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  const result = expect(fetchCredentialUtxosFromKoios("cc".repeat(28)))
    .rejects.toThrow("Lookup deadline");
  await vi.advanceTimersByTimeAsync(0);
  controller.abort(new Error("Lookup deadline"));
  await Promise.all([result, vi.runAllTimersAsync()]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(timeout).toHaveBeenCalledExactlyOnceWith(15_000);
});
