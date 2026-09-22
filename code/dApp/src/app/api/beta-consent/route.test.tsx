// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { LEGAL_VERSION } from "@/lib/legal";
import { BETA_CONSENT_COOKIE, betaConsentValue } from "@/lib/legal/beta-consent";

const acceptance = { network: CARDANO_NETWORK, version: LEGAL_VERSION, beta: true, unaudited: true, totalLoss: true, liabilityRelease: true, terms: true };
function request(body: unknown = acceptance, origin = "https://wallet.example") {
  return new NextRequest("https://wallet.example/api/beta-consent", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("beta acknowledgement endpoint", () => {
  it("sets a session-only protected cookie after every checkbox is accepted", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const response = await POST(request());
      expect(response.status).toBe(200);
      const cookie = response.headers.get("set-cookie")!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=strict");
      expect(cookie).not.toContain("Max-Age");
      expect(cookie).not.toContain("Expires");
      expect(cookie).not.toContain("Domain");
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally { vi.unstubAllEnvs(); }
  });
  it.each(["beta", "unaudited", "totalLoss", "liabilityRelease", "terms"])("rejects missing %s acceptance", async (key) => {
    const response = await POST(request({ ...acceptance, [key]: false }));
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("rejects an omitted release or the previous terms version", async () => {
    for (const body of [
      { ...acceptance, liabilityRelease: undefined },
      { ...acceptance, version: "epora-beta-1" }
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });
  it("rejects a cross-origin acceptance attempt", async () => {
    expect((await POST(request(acceptance, "https://other.example"))).status).toBe(403);
  });
  it("reports absent and current acknowledgement without caching", async () => {
    expect(await GET(new NextRequest("https://wallet.example/api/beta-consent")).json()).toMatchObject({ accepted: false });
    const response = GET(new NextRequest("https://wallet.example/api/beta-consent", { headers: { cookie: `${BETA_CONSENT_COOKIE}=${betaConsentValue()}` } }));
    expect(await response.json()).toMatchObject({ accepted: true, network: CARDANO_NETWORK, version: LEGAL_VERSION });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
