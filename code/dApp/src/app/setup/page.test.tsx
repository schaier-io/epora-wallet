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
vi.mock("@/components/setup/stt-reference-setup", () => ({
  SttReferenceSetup: () => <div>Setup client</div>
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

    expect(screen.getByText("Setup client")).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders setup when discovery is temporarily unavailable", async () => {
    mocks.resolveStore.mockRejectedValue(new Error("provider unavailable"));

    render(await SetupPage());

    expect(screen.getByText("Setup client")).toBeInTheDocument();
  });
});
