// @vitest-environment node
import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
vi.mock("@/lib/cardano-network", () => ({ CARDANO_NETWORK: "mainnet" }));
import { proxy, config } from "./proxy";
import { BETA_CONSENT_COOKIE, BETA_CONSENT_HEADER, betaConsentValue } from "@/lib/legal/beta-consent";

function request(path = "/api/mesh", headers: Record<string, string> = {}, method = "POST") {
  return new NextRequest(`https://wallet.example${path}`, { method, headers });
}

it.each<Record<string, string>>([{}, { "next-router-prefetch": "1" }, { purpose: "prefetch" }])("API matching cannot be bypassed by prefetch headers (%j)", (headers) => {
  expect(unstable_doesMiddlewareMatch({ config, url: "https://wallet.example/api/mesh", headers })).toBe(true);
  expect(proxy(request("/api/mesh", headers)).status).toBe(403);
});

it.each(["/api/mesh", "/api/proposals", "/api/proposals/auth", "/api/proposals/auth/nonce", "/api/proposals/id/sign", "/api/proposals/id/submit", "/api/v1/tx/mint", "/api/stt/sync/other"])("blocks %s without current mainnet acceptance", async (path) => {
  const response = proxy(request(path));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "BETA_CONSENT_REQUIRED", acknowledgement: betaConsentValue() });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("accepts either the explicit API header or browser cookie", () => {
  for (const headers of [{ [BETA_CONSENT_HEADER]: betaConsentValue() }, { cookie: `${BETA_CONSENT_COOKIE}=${betaConsentValue()}` }] as Record<string, string>[]) {
    expect(proxy(request("/api/mesh", headers)).headers.get("x-middleware-next")).toBe("1");
  }
});

it.each(["accepted", "mainnet:old", "mainnet:epora-beta-1", "mainnet:epora-beta-2", betaConsentValue("preprod")])("rejects stale or other-network acknowledgements (%s)", (value) => {
  expect(proxy(request("/api/mesh", { [BETA_CONSENT_HEADER]: value })).status).toBe(403);
  expect(proxy(request("/api/mesh", { cookie: `${BETA_CONSENT_COOKIE}=${value}` })).status).toBe(403);
});

it("preserves exact operational exemptions and gates proposal deletion/rebuild", () => {
  expect(proxy(request("/api/stt/sync")).headers.get("x-middleware-next")).toBe("1");
  expect(proxy(request("/api/beta-consent")).headers.get("x-middleware-next")).toBe("1");
  expect(proxy(request("/api/proposals/auth", {}, "DELETE")).headers.get("x-middleware-next")).toBe("1");
  expect(proxy(request("/api/proposals/id", {}, "DELETE")).status).toBe(403);
  expect(proxy(request("/api/proposals/id/rebuild", {}, "PATCH")).status).toBe(403);
});
