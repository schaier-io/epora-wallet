import { beforeEach, expect, it, vi } from "vitest";
import { DREP_SEARCH_QUERY_MAX_LENGTH, DrepSearchResponseSchema } from "@/lib/api/dreps";
import { KoiosDrepsError, resetDrepIndexForTests } from "@/lib/governance/drep-index";

const mocks = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "dreps:test",
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/governance/koios-dreps", () => ({ koiosDrepCall: mocks.call }));

import { GET } from "./route";

const DREPS = [
  { drep_id: "drep1epora", name: "Epora Collective" },
  { drep_id: "drep1other", name: { "@value": "Other" } }
];

function search(q?: string) {
  const url = q == null ? "http://localhost/api/v1/dreps/search" : `http://localhost/api/v1/dreps/search?q=${encodeURIComponent(q)}`;
  return GET(new Request(url));
}

beforeEach(() => {
  resetDrepIndexForTests();
  mocks.call.mockReset();
  mocks.call.mockImplementation(async (path: string, body?: { _drep_ids: string[] }) => {
    if (path.startsWith("/drep_list")) return DREPS.map(({ drep_id }) => ({ drep_id }));
    const ids = body?._drep_ids ?? [];
    if (path.startsWith("/drep_info")) {
      return ids.map((drep_id) => ({ drep_id, drep_status: "registered", active: true, amount: "5", has_script: false }));
    }
    return DREPS.filter((drep) => ids.includes(drep.drep_id));
  });
});

it("finds a DRep by name, in the documented shape", async () => {
  const response = await search("epo");
  const body = DrepSearchResponseSchema.parse(await response.json());

  expect(response.status).toBe(200);
  expect(body.dreps).toEqual([
    { drepId: "drep1epora", name: "Epora Collective", votingPowerLovelace: "5", hasScript: false, status: "active" }
  ]);
});

it("returns the shortlist when there is no query", async () => {
  const body = DrepSearchResponseSchema.parse(await (await search()).json());

  expect(body.dreps.map((drep) => drep.name).sort()).toEqual(["Epora Collective", "Other"]);
});

it("rejects an over-long query before reading the chain", async () => {
  const response = await search("x".repeat(DREP_SEARCH_QUERY_MAX_LENGTH + 1));

  expect(response.status).toBe(400);
  expect(mocks.call).not.toHaveBeenCalled();
});

it("asks a rate-limited client to wait out the whole rebuild backoff", async () => {
  mocks.call.mockRejectedValue(new KoiosDrepsError(429, "20"));

  const response = await search("epo");

  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("30");
});

it("keeps a Koios Retry-After longer than the backoff", async () => {
  mocks.call.mockRejectedValue(new KoiosDrepsError(429, "90"));

  expect((await search("epo")).headers.get("Retry-After")).toBe("90");
  const replay = await search("epo");

  expect(Number(replay.headers.get("Retry-After"))).toBeGreaterThan(60);
});

it("answers a search during the backoff without calling Koios again", async () => {
  mocks.call.mockRejectedValue(new KoiosDrepsError(429, null));
  await search("epo");
  const callsAfterFailure = mocks.call.mock.calls.length;

  const replay = await search("epo");

  expect(replay.status).toBe(429);
  expect(mocks.call.mock.calls.length).toBe(callsAfterFailure);
});

it("answers 502 when Koios is down or unreachable", async () => {
  mocks.call.mockRejectedValue(new KoiosDrepsError(503, null));
  expect((await search("epo")).status).toBe(502);

  resetDrepIndexForTests();
  mocks.call.mockRejectedValue(new TypeError("fetch failed"));
  expect((await search("epo")).status).toBe(502);

  resetDrepIndexForTests();
  mocks.call.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
  expect((await search("epo")).status).toBe(502);

  resetDrepIndexForTests();
  mocks.call.mockRejectedValue(new SyntaxError("Unexpected token < in JSON"));
  expect((await search("epo")).status).toBe(502);
});

it("answers 500, not a provider outage, for its own bug", async () => {
  mocks.call.mockRejectedValue(new RangeError("bug"));

  expect((await search("epo")).status).toBe(500);
});
