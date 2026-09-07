import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn()
}));

vi.mock("@walletconnect/sign-client", () => ({
  SignClient: { init: mocks.init }
}));

vi.mock("@/lib/env/client-env", () => ({
  SITE_URL: "https://epora.test",
  WALLETCONNECT_PROJECT_ID: "test-project"
}));

beforeEach(() => {
  vi.resetModules();
  mocks.init.mockReset();
});

it("retries client initialization after an earlier attempt fails", async () => {
  const client = { session: { getAll: () => [] } };
  mocks.init.mockRejectedValueOnce(new Error("relay unavailable")).mockResolvedValueOnce(client);
  const { getSignClient } = await import("./client");

  await expect(getSignClient()).rejects.toThrow("relay unavailable");
  await expect(getSignClient()).resolves.toBe(client);
  expect(mocks.init).toHaveBeenCalledTimes(2);
});
