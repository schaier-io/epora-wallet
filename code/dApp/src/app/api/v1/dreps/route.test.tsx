import { beforeEach, expect, it, vi } from "vitest";
import { DrepsResponseSchema } from "@/lib/api/dreps";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: () => "dreps:test",
  rateLimit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/mesh/blockfrost-server", () => ({
  getBlockfrostProvider: () => ({ get: mocks.get })
}));

import { GET } from "./route";

// CIP-129 test vector: a DRep key hash of 28 zero bytes.
const DREP_ID = "drep1ygqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq7vlc9n";

function meshHttpError(status: number, headers: Record<string, string> = {}) {
  return JSON.stringify({ data: { status_code: status }, headers, status });
}

function get(id = DREP_ID) {
  return GET(new Request(`http://localhost/api/v1/dreps?id=${encodeURIComponent(id)}`));
}

function answer(drep: Record<string, unknown>, metadata: unknown) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/metadata")) {
      if (metadata instanceof Error || typeof metadata === "string") throw metadata;
      return metadata;
    }
    return drep;
  });
}

async function drepOf(response: Response) {
  const parsed = DrepsResponseSchema.safeParse(await response.json());
  expect(parsed.success).toBe(true);
  return parsed.data!.drep;
}

beforeEach(() => {
  mocks.get.mockReset();
});

it("rejects a missing id without calling Blockfrost", async () => {
  const response = await GET(new Request("http://localhost/api/v1/dreps"));

  expect(response.status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("rejects an id that is not a DRep id without calling Blockfrost", async () => {
  const response = await get("pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy");

  expect(response.status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("answers Blockfrost's 400 for a bad checksum as an invalid id", async () => {
  mocks.get.mockRejectedValue(meshHttpError(400));

  const response = await get();

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "That doesn't look like a DRep id (expected `drep1…`)." });
});

it("answers 404 only when Blockfrost has no such DRep", async () => {
  mocks.get.mockRejectedValue(meshHttpError(404));

  const response = await get();

  expect(response.status).toBe(404);
});

it("answers a Blockfrost outage as 502, not as a missing DRep", async () => {
  mocks.get.mockRejectedValue(meshHttpError(503));

  const response = await get();

  expect(response.status).toBe(502);
});

it("passes Blockfrost's rate limit on as a 429 with its Retry-After", async () => {
  mocks.get.mockRejectedValue(meshHttpError(429, { "Retry-After": "20" }));

  const response = await get();

  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("20");
});

it("keeps 500 for a failure that is not the provider's", async () => {
  mocks.get.mockRejectedValue(new TypeError("boom"));

  const response = await get();

  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "DRep lookup failed." });
});

it("returns the DRep with its CIP-119 name", async () => {
  answer(
    { drep_id: DREP_ID, amount: "2000000", has_script: false, retired: false, expired: false },
    { json_metadata: { body: { givenName: "Ada Lovelace" } } }
  );

  const drep = await drepOf(await get());

  expect(drep).toEqual({
    drepId: DREP_ID,
    name: "Ada Lovelace",
    votingPowerLovelace: "2000000",
    hasScript: false,
    status: "active"
  });
});

it("reads a name wrapped as JSON-LD inside a stringified document", async () => {
  answer(
    { drep_id: DREP_ID, amount: "0", has_script: true, retired: false, expired: false },
    { json_metadata: JSON.stringify({ body: { givenName: { "@value": "Script DRep" } } }) }
  );

  const drep = await drepOf(await get());

  expect(drep.name).toBe("Script DRep");
  expect(drep.hasScript).toBe(true);
});

it("still returns the DRep when its metadata fails", async () => {
  answer({ drep_id: DREP_ID, amount: "5", retired: false, expired: false }, meshHttpError(500));

  const drep = await drepOf(await get());

  expect(drep.name).toBeNull();
});

it("reports a retired DRep as retired and an expired one as inactive", async () => {
  answer({ drep_id: DREP_ID, amount: "5", retired: true, expired: true }, meshHttpError(404));
  expect((await drepOf(await get())).status).toBe("retired");

  answer({ drep_id: DREP_ID, amount: "5", retired: false, expired: true }, meshHttpError(404));
  expect((await drepOf(await get())).status).toBe("inactive");
});

it("drops a voting power that is not a lovelace amount", async () => {
  answer({ drep_id: DREP_ID, amount: 12, retired: false, expired: false }, meshHttpError(404));

  expect((await drepOf(await get())).votingPowerLovelace).toBeNull();
});

it("keeps the requested id when Blockfrost answers with another encoding", async () => {
  // Blockfrost's own example: a script DRep reported under a 56-char CIP-105 id. Mesh would
  // read that id as a key hash, so the certificate must carry the CIP-129 id that was asked for.
  answer(
    { drep_id: "drep15cfxz9exyn5rx0807zvxfrvslrjqfchrd4d47kv9e0f46uedqtc", amount: "1", has_script: true, retired: false, expired: false },
    meshHttpError(404)
  );

  expect((await drepOf(await get())).drepId).toBe(DREP_ID);
});
