// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/cardano-network", () => ({ CARDANO_NETWORK: "mainnet" }));
import { BetaConsentRequiredError, requireBrowserBetaConsent } from "./browser-beta-consent";
import { LEGAL_VERSION } from "@/lib/legal";

afterEach(() => vi.unstubAllGlobals());

it.each([
  { accepted: false, network: "mainnet", version: LEGAL_VERSION },
  { accepted: true, network: "preprod", version: LEGAL_VERSION },
  { accepted: true, network: "mainnet", version: "old" },
  { accepted: "true", network: "mainnet", version: LEGAL_VERSION },
  null
])("refuses missing or stale acceptance (%j)", async (receipt) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => receipt }));
  await expect(requireBrowserBetaConsent()).rejects.toBeInstanceOf(BetaConsentRequiredError);
});

it("fails closed when the acknowledgement service is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failed")));
  await expect(requireBrowserBetaConsent()).rejects.toThrow("Reload and accept the current risks and terms");
});

it("checks current acceptance without a cached response", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: true, network: "mainnet", version: LEGAL_VERSION }) });
  vi.stubGlobal("fetch", fetcher);
  await expect(requireBrowserBetaConsent()).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledWith("/api/beta-consent", { credentials: "same-origin", cache: "no-store" });
});
