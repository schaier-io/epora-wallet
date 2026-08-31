// @vitest-environment node
//
// Route-level failures for the one public read that takes a body. The happy
// path is covered against a seeded database in
// src/lib/api/response-conformance.test.ts; what is asserted here is that the
// documented status codes are the ones a caller actually receives.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorSchema } from "@/lib/api/errors";
import { SttLookupInputError } from "@/lib/stt-cache/lookup";
import type * as SttLookup from "@/lib/stt-cache/lookup";

const rateLimit = vi.hoisted(() => vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })));
vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: (_request: Request, scope: string) => `${scope}:conformance`,
  rateLimit
}));

const lookupSttWallets = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stt-cache/lookup", async (importOriginal) => ({
  ...(await importOriginal<typeof SttLookup>()),
  lookupSttWallets
}));

import { POST as lookup } from "./lookup/route";

function post(body: unknown) {
  return lookup(
    new Request("http://localhost/api/v1/stt/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function errorOf(response: Response) {
  const body: unknown = await response.json();
  expect(ApiErrorSchema.safeParse(body).success).toBe(true);
  return (body as { error: string }).error;
}

describe("the lookup route's documented failures", () => {
  it("answers malformed JSON with 400, not a logged 500", async () => {
    const response = await post("{ not json");

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("Request body is not valid JSON.");
    expect(lookupSttWallets).not.toHaveBeenCalled();
  });

  it("refuses a body over the documented 4 KB limit", async () => {
    const response = await post({ address: `addr_test1${"q".repeat(5000)}` });

    expect(response.status).toBe(413);
    expect(await errorOf(response)).toContain("4096");
    expect(lookupSttWallets).not.toHaveBeenCalled();
  });

  it("rejects a body the request schema does not accept", async () => {
    const response = await post({ txLimit: 9000 });

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatch(/./);
    expect(lookupSttWallets).not.toHaveBeenCalled();
  });

  it("maps an unparseable address onto 400 rather than 500", async () => {
    lookupSttWallets.mockRejectedValueOnce(
      new SttLookupInputError(
        'Invalid Cardano address "addr_test1nope". Expected a bech32 payment address.'
      )
    );

    const response = await post({ address: "addr_test1nope" });

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toContain("bech32 payment address");
  });
});

describe("the lookup route's rate limit", () => {
  it("answers 429 with Retry-After and the documented body", async () => {
    rateLimit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 42 });

    const response = await post({ address: "addr_test1qq" });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await errorOf(response)).toBe("Too many wallet lookups. Try again shortly.");
    expect(lookupSttWallets).not.toHaveBeenCalled();
  });
});
