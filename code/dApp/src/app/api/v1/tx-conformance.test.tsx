// @vitest-environment node
//
// jsdom replaces the `Uint8Array` global, so a `Buffer` made inside Mesh fails
// its own `instanceof Uint8Array` check and `applyParamsToScript` throws
// "Unsupported Plutus version or invalid Plutus script bytes". The builder
// needs no DOM, so this file runs on node.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UTxO } from "@meshsdk/common";
import type * as ServerWallet from "@/lib/mesh/server-wallet";
import { BuildResultSchema } from "@/lib/api/tx-result";
import { ApiErrorSchema } from "@/lib/api/errors";

// Generation cannot check that a handler's real response matches the schema it
// claims, because it never runs one. This file runs the real route handler and
// the real builder against a mock chain client, then parses the answer with the
// schema the spec publishes.

vi.mock("@/lib/http/rate-limit", () => ({
  clientKey: (_request: Request, scope: string) => `${scope}:conformance`,
  rateLimit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 }))
}));

const CALLER =
  "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59";

/**
 * Enough chain for a deposit to build: funded UTxOs at the caller's address,
 * current parameters, and an evaluator. A deposit runs no script, so the
 * evaluator answers with an empty redeemer list.
 */
const chain = vi.hoisted(() => {
  const utxos = [0, 1, 2].map((index) => ({
    input: { txHash: "ab".repeat(32), outputIndex: index },
    output: {
      address:
        "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59",
      amount: [{ unit: "lovelace", quantity: "50000000" }]
    }
  }));
  return { utxos, calls: [] as string[] };
});

vi.mock("@/lib/mesh/server-wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof ServerWallet>();
  const { DEFAULT_PROTOCOL_PARAMETERS: params } = await import("@meshsdk/common");
  return {
    ...actual,
    createServerTxFetcher: () => ({
      fetchAddressUTxOs: async (address: string) => {
        chain.calls.push(`fetchAddressUTxOs:${address.slice(0, 12)}`);
        return address.startsWith("addr_test1q") ? (chain.utxos as UTxO[]) : [];
      },
      fetchProtocolParameters: async () => {
        chain.calls.push("fetchProtocolParameters");
        return params;
      },
      fetchCostModels: async () => {
        chain.calls.push("fetchCostModels");
        return [] as number[][];
      },
      fetchUTxOs: async () => [],
      evaluateTx: async () => {
        chain.calls.push("evaluateTx");
        return [];
      },
      get: async () => ({})
    })
  };
});

import { POST as consolidate } from "./tx/consolidate/route";
import { POST as deployReference } from "./tx/deploy-reference/route";
import { POST as lockFunds } from "./tx/lock-funds/route";
import { POST as mint } from "./tx/mint/route";
import { POST as publish } from "./tx/publish/route";
import { POST as setStakeCredential } from "./tx/set-stake-credential/route";
import { POST as sttSpend } from "./tx/stt-spend/route";
import { POST as vote } from "./tx/vote/route";
import { POST as walletSpend } from "./tx/wallet-spend/route";
import { POST as walletWithdraw } from "./tx/wallet-withdraw/route";

// Every build route the spec documents. The list is asserted against the spec
// below, so a new route cannot be added without landing here too.
const BUILD_ROUTES = [
  ["/api/v1/tx/consolidate", consolidate],
  ["/api/v1/tx/deploy-reference", deployReference],
  ["/api/v1/tx/lock-funds", lockFunds],
  ["/api/v1/tx/mint", mint],
  ["/api/v1/tx/publish", publish],
  ["/api/v1/tx/set-stake-credential", setStakeCredential],
  ["/api/v1/tx/stt-spend", sttSpend],
  ["/api/v1/tx/vote", vote],
  ["/api/v1/tx/wallet-spend", walletSpend],
  ["/api/v1/tx/wallet-withdraw", walletWithdraw]
] as const;

const CONFIG = {
  sttAssetNameHex: "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae",
  walletPolicyId: "67c11430b30ec8d03c2cce22b149265fef3c866af5b364568185f93c",
  walletAssetNameHex: "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae"
};

function post(handler: (request: Request) => Promise<Response>, body: unknown) {
  return handler(
    new Request("http://localhost/api/v1/tx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

beforeEach(() => {
  chain.calls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("a real build against a mock chain client", () => {
  it("answers with a body that matches BuildResult", async () => {
    const response = await post(lockFunds, {
      address: CALLER,
      config: CONFIG,
      assets: [{ unit: "lovelace", quantity: "10000000" }]
    });

    const body: unknown = await response.json();
    expect(response.status, `unexpected body: ${JSON.stringify(body)}`).toBe(200);

    // The builder really ran, against the mock, rather than being stubbed out.
    expect(chain.calls).toContain("fetchProtocolParameters");
    expect(chain.calls.some((call) => call.startsWith("fetchAddressUTxOs"))).toBe(true);

    const parsed = BuildResultSchema.safeParse(body);
    expect(
      parsed.success,
      `response does not match BuildResultSchema: ${JSON.stringify(parsed.error?.issues)}`
    ).toBe(true);

    // Guard against a schema loose enough to accept an empty answer.
    const result = parsed.data!;
    expect(result.txHex.length).toBeGreaterThan(0);
    expect(Number(result.estimatedFeeLovelace)).toBeGreaterThan(0);
    expect(result.preview.txSize?.usedBytes ?? 0).toBeGreaterThan(0);
  });
});

describe("documented failures", () => {
  it("rejects a body that the request schema does not accept, naming the field", async () => {
    const response = await post(mint, { address: CALLER });
    const body: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect((body as { error: string }).error).toMatch(/^stateDatum: /);
  });

  it("rejects a mainnet address before reaching the chain", async () => {
    const response = await post(mint, {
      address: "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3v",
      stateDatum: { alternative: 0, fields: [] }
    });

    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toMatch(/addr_test1/);
    expect(chain.calls).toEqual([]);
  });

  it("names the unknown action on the nine-action union", async () => {
    const response = await post(sttSpend, { address: CALLER, action: "teleport" });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/^action: /);
    expect(body.error).toContain("renew-proof-of-life");
  });

  it("refuses a body over the documented 32 KB limit", async () => {
    const oversized = JSON.stringify({
      address: CALLER,
      stateDatum: { alternative: 0, fields: ["a".repeat(40_000)] }
    });

    const response = await post(mint, oversized);
    const body: unknown = await response.json();

    expect(response.status).toBe(413);
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(chain.calls).toEqual([]);
  });

  it("refuses a body nested deep enough to overflow the datum schema", async () => {
    // `stateDatum.fields` is recursive, so zod parses it recursively. Without a
    // depth ceiling this body raises RangeError inside the handler and the
    // caller is answered 500 for their own malformed request. 15,000 levels is
    // ~30 KB, inside the 32 KB body limit.
    const depth = 15_000;
    const nested = "[".repeat(depth) + "]".repeat(depth);
    const response = await post(
      mint,
      `{"address":"${CALLER}","stateDatum":{"alternative":0,"fields":${nested}}}`
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect((body as { error: string }).error).toBe("Request body nests deeper than 64 levels.");
    expect(chain.calls).toEqual([]);
  });

  it("answers malformed JSON with 400, not a logged 500", async () => {
    const response = await post(mint, "{ not json");
    const body: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect((body as { error: string }).error).toBe("Request body is not valid JSON.");
    expect(chain.calls).toEqual([]);
  });
});

describe("every documented build route", () => {
  it("is in this file's list, so none goes untested", async () => {
    const { buildOpenApiDocument } = await import("@/lib/api/openapi");
    const documented = Object.keys(buildOpenApiDocument().paths ?? {})
      .filter((route) => route.startsWith("/api/v1/tx/"))
      .sort();

    expect(BUILD_ROUTES.map(([route]) => route)).toEqual(documented);
  });

  it.each(BUILD_ROUTES)("%s rejects an empty body with a field-named 400", async (_route, handler) => {
    const response = await post(handler, {});
    const body: unknown = await response.json();

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    // Not a bare "Invalid transaction build request.": the caller is told
    // which field to fix.
    expect((body as { error: string }).error).toMatch(/^[a-zA-Z]+[\w.]*: /);
    expect(chain.calls).toEqual([]);
  });
});
