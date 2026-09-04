// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => ({
  runSttBackgroundSync: vi.fn()
}));

vi.mock("@/lib/stt-cache/indexer", () => sync);
vi.mock("@/lib/stt-cache/sync-lock", () => ({
  withSttSyncAdvisoryLock: vi.fn(async (run: () => Promise<unknown>) => ({
    acquired: true,
    result: await run()
  }))
}));
vi.mock("@/lib/env/server-env", () => ({
  getSttSyncSecret: () => "sync-secret"
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key
}));

import { POST } from "./route";

function request(body?: string) {
  return new Request("http://localhost/api/stt/sync", {
    method: "POST",
    headers: {
      authorization: "Bearer sync-secret",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body
  });
}

describe("POST /api/stt/sync", () => {
  beforeEach(() => {
    sync.runSttBackgroundSync.mockReset();
    sync.runSttBackgroundSync.mockResolvedValue({ walletsUpdated: 0 });
  });

  it("uses default budgets when the request has no body", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(sync.runSttBackgroundSync).toHaveBeenCalledOnce();
  });

  it("rejects malformed JSON without starting a sync", async () => {
    const response = await POST(request("{ not json"));

    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toBe(
      "Request body is not valid JSON."
    );
    expect(sync.runSttBackgroundSync).not.toHaveBeenCalled();
  });

  it("rejects deeply nested JSON without starting a sync", async () => {
    const nested = "[".repeat(65) + "]".repeat(65);
    const response = await POST(request(nested));

    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toBe(
      "Request body nests deeper than 64 levels."
    );
    expect(sync.runSttBackgroundSync).not.toHaveBeenCalled();
  });
});
