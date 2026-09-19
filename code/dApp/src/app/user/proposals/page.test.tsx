import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// The workspace suspends on its data fetch. A never-resolving promise reproduces
// that state, so the test sees the fallback the way a first visit does. Mocking
// the shim (not the workspace behind it) keeps these tests on the page's own
// rendering, the same split the setup page tests use.
vi.mock("@/components/user/proposals/lazy-proposals-workspace", () => ({
  LazyProposalsWorkspace: () => {
    throw new Promise(() => {});
  }
}));

vi.mock("@/i18n/scoped-client-provider", () => ({
  ScopedClientIntlProvider: ({ children }: { children: ReactNode }) => children
}));

const { default: ProposalsPage } = await import("./page");

describe("proposals page loading fallback", () => {
  /** A plain div left the loading state silent to screen readers. */
  it("announces that approval requests are loading", () => {
    render(<ProposalsPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading approval requests…");
  });
});
