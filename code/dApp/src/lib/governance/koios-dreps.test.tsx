// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { KoiosDrepsError } from "@/lib/governance/drep-index";

vi.mock("@/lib/env/server-env", () => ({
  getServerEnv: () => ({ KOIOS_URL: "https://koios.example/api/v1" })
}));

import { koiosDrepCall } from "@/lib/governance/koios-dreps";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("GETs without a body and POSTs a body as JSON", async () => {
  const fetchMock = vi.fn(async () => new Response("[]"));
  vi.stubGlobal("fetch", fetchMock);

  await koiosDrepCall("/drep_updates");
  await koiosDrepCall("/drep_info", { _drep_ids: ["drep1x"] });

  expect(fetchMock.mock.calls[0]).toEqual([
    "https://koios.example/api/v1/drep_updates",
    expect.objectContaining({ method: "GET", body: undefined })
  ]);
  expect(fetchMock.mock.calls[1]).toEqual([
    "https://koios.example/api/v1/drep_info",
    expect.objectContaining({ method: "POST", body: '{"_drep_ids":["drep1x"]}' })
  ]);
});

it("reports an error status with Koios's Retry-After", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "12" } })));

  const error: unknown = await koiosDrepCall("/drep_updates").catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(KoiosDrepsError);
  expect(error).toMatchObject({ status: 429, retryAfter: "12" });
});

it.each([
  ["an unreachable host", () => Promise.reject(new TypeError("fetch failed"))],
  ["a timeout", () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))],
  ["a body that is not JSON", () => Promise.resolve(new Response("<html>"))]
])("reports %s as a Koios failure, not as a bug", async (_, answer) => {
  vi.stubGlobal("fetch", vi.fn(answer));

  await expect(koiosDrepCall("/drep_updates")).rejects.toMatchObject({ name: "KoiosDrepsError", status: 0 });
});
