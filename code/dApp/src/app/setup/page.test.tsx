import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  resolveStore: vi.fn()
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/mesh/shared-stt-reference-server", () => ({
  resolveSharedSttReferenceServer: mocks.resolveStore
}));
vi.mock("@/i18n/scoped-client-provider", () => ({
  ScopedClientIntlProvider: ({ children }: { children: React.ReactNode }) => children
}));

/**
 * The page hands the view to `LazySttReferenceSetup`, the route's client-only dynamic
 * boundary (issue #410; guarded by app/layout-mesh-boundary.test.ts). Mocking the shim
 * keeps these tests on the page's server logic, and the `data-initial-store` attribute
 * asserts the server-read store still reaches the client view through the boundary.
 */
vi.mock("@/components/setup/lazy-stt-reference-setup", () => ({
  LazySttReferenceSetup: ({ initialStore }: { initialStore: unknown }) => (
    <div data-initial-store={JSON.stringify(initialStore)}>Setup client</div>
  )
}));

const { default: SetupPage } = await import("./page");

describe("setup page", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
    mocks.resolveStore.mockReset();
  });

  it("redirects home when the current STT reference exists", async () => {
    mocks.resolveStore.mockResolvedValue({ status: "ready" });

    await SetupPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("renders setup when the current STT reference is missing", async () => {
    mocks.resolveStore.mockResolvedValue({ status: "missing" });

    render(await SetupPage());

    expect(screen.getByText("Setup client")).toHaveAttribute(
      "data-initial-store",
      JSON.stringify({ status: "missing" })
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders setup when discovery is temporarily unavailable", async () => {
    mocks.resolveStore.mockRejectedValue(new Error("provider unavailable"));

    render(await SetupPage());

    expect(screen.getByText("Setup client")).toHaveAttribute(
      "data-initial-store",
      "null"
    );
  });
});
