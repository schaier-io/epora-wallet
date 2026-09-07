// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/http/rate-limit", () => ({ clientKey: () => "caller", rateLimit: mocks.rateLimit }));
vi.mock("@/lib/mesh/shared-stt-reference-server", () => ({ resolveSharedSttReferenceServer: mocks.resolve }));
vi.mock("@/lib/observability/logger", () => ({ logger: {error:vi.fn()}, serializeError: () => ({}) }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.rateLimit.mockResolvedValue({ok:true}); });
it("returns the server's verified helper reference without HTTP caching", async () => {
  const result = {status:"ready",activeReference:"tx#0"}; mocks.resolve.mockResolvedValue(result);
  const response = await GET(new Request("http://localhost/api/shared-helper"));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({result});
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("returns missing state without asking callers to create a helper", async () => {
  const result = {status:"missing",activeReference:null}; mocks.resolve.mockResolvedValue(result);
  const response = await GET(new Request("http://localhost/api/shared-helper"));
  expect(await response.json()).toEqual({result});
});
it("returns 503 without exposing provider errors", async () => {
  mocks.resolve.mockRejectedValue(new Error("secret provider details"));
  const response = await GET(new Request("http://localhost/api/shared-helper"));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({error:"SHARED_HELPER_UNAVAILABLE"});
});
it("rate limits before discovery", async () => {
  mocks.rateLimit.mockResolvedValue({ok:false,retryAfterSeconds:12});
  const response = await GET(new Request("http://localhost/api/shared-helper"));
  expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("12");
  expect(mocks.resolve).not.toHaveBeenCalled();
});
