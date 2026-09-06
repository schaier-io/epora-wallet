import { describe, expect, it, vi } from "vitest";

// A .tsx file with no JSX in it: the two runners are split by extension, and the
// node:test half cannot import this module (see vitest.config.ts).

const signClient = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("@walletconnect/sign-client", () => ({ SignClient: signClient }));
vi.mock("@/lib/env/client-env", () => ({
  SITE_URL: "https://example.test",
  WALLETCONNECT_PROJECT_ID: "project-id"
}));

const { getSignClient } = await import("@/lib/walletconnect/client");

describe("getSignClient", () => {
  it("retries after a failed init instead of answering with the old failure", async () => {
    // The relay is reachable again on the second attempt. While the rejected
    // promise stayed cached, every later "Connect with WalletConnect" answered
    // with the first error for the life of the tab and only a reload recovered.
    signClient.init.mockRejectedValueOnce(new Error("relay unreachable"));
    signClient.init.mockResolvedValueOnce({ session: "ready" });

    await expect(getSignClient()).rejects.toThrow("relay unreachable");

    await expect(getSignClient()).resolves.toEqual({ session: "ready" });
    expect(signClient.init).toHaveBeenCalledTimes(2);
  });

  it("reuses one client once init succeeds", async () => {
    signClient.init.mockClear();

    const first = await getSignClient();
    const second = await getSignClient();

    expect(second).toBe(first);
    expect(signClient.init).not.toHaveBeenCalled();
  });
});
