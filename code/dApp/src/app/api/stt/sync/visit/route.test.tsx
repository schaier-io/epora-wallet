// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ session: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/proposals/api-helpers", () => ({ getProposalSession: boundary.session }));
vi.mock("@/lib/stt-cache/visit-sync", () => ({ runSttVisitSync: boundary.sync, STT_VISIT_SYNC_COOLDOWN_MS: 15 * 60_000 }));
vi.mock("@/lib/observability/logger", () => ({ logger: { error: vi.fn() }, serializeError: (error: unknown) => error }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { POST } from "./route";

const ADDRESS = "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
function request(body: unknown = {}, origin: string | null = "http://localhost") {
  return new Request("http://localhost/api/stt/sync/visit", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin === null ? {} : { origin }) },
    body: JSON.stringify(body)
  });
}
beforeEach(() => {
  boundary.session.mockReset().mockResolvedValue(null);
  boundary.sync.mockReset().mockResolvedValue({ outcome: "skipped", retryAfterMs: 1000 });
});

it.each([null, "https://other.example"])("rejects origin %s before any session or database work", async origin => {
  expect((await POST(request({ address: ADDRESS }, origin))).status).toBe(403);
  expect(boundary.session).not.toHaveBeenCalled();
  expect(boundary.sync).not.toHaveBeenCalled();
});

it("rejects a guest without touching the sync database", async () => {
  expect((await POST(request())).status).toBe(401);
  expect(boundary.sync).not.toHaveBeenCalled();
});

it("accepts a validated wallet hint without a proposal session or signature", async () => {
  const response = await POST(request({ address: ADDRESS }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ outcome: "skipped", retryAfterMs: 1000 });
  expect(boundary.sync).toHaveBeenCalledOnce();
  expect(boundary.sync).toHaveBeenCalledWith();
});

it("accepts a verified proposal session without a wallet hint", async () => {
  boundary.session.mockResolvedValue({ paymentKeyHash: "aa".repeat(28) });
  expect((await POST(request())).status).toBe(200);
  expect(boundary.sync).toHaveBeenCalledOnce();
});

it.each([
  { address: "demo" }, { address: "addr1invalid" },
  { address: ADDRESS, timeBudgetMs: 1 }, { address: ADDRESS, recentHeadPageBudget: 50 },
  { demo: true }
])("rejects invalid addresses, demo flags, or caller budgets before sync: %j", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(boundary.sync).not.toHaveBeenCalled();
});

it("rejects oversized and malformed bodies before sync", async () => {
  expect((await POST(request({ address: "x".repeat(513) }))).status).toBe(413);
  const malformed = new Request("http://localhost/api/stt/sync/visit", {
    method: "POST", headers: { origin: "http://localhost" }, body: "{"
  });
  expect((await POST(malformed)).status).toBe(400);
  expect(boundary.sync).not.toHaveBeenCalled();
});

it("returns a cooldown after a failed attempt", async () => {
  boundary.sync.mockRejectedValue(new Error("provider unavailable"));
  const response = await POST(request({ address: ADDRESS }));
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ retryAfterMs: 15 * 60_000 });
});
