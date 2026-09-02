import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/user");
vi.mock("next/navigation", () => ({
  usePathname: () => pathname()
}));

const { SiteFooter } = await import("@/components/layout/site-footer");

/**
 * The footer's second row is a list of links joined by "·". The "Wallet home" link only
 * exists off `/user`, and the separator before the Catalyst link must exist exactly when
 * that link does: on `/user` the row would otherwise open with an orphaned
 * "· Catalyst proposal".
 */
function trailingSeparator() {
  const separators = Array.from(document.querySelectorAll('[aria-hidden="true"]')).filter(
    (node) => node.textContent?.trim() === "·"
  );
  return separators.at(-1);
}

describe("footer separators", () => {
  it("renders no leading separator on /user, where nothing precedes Catalyst", () => {
    pathname.mockReturnValue("/user");
    render(<SiteFooter />);

    expect(screen.queryByRole("link", { name: "Wallet home" })).toBeNull();
    expect(trailingSeparator()).toBeUndefined();
  });

  it("separates Wallet home from Catalyst once Wallet home is shown", () => {
    pathname.mockReturnValue("/payee");
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Wallet home" })).toBeTruthy();
    expect(trailingSeparator()).toBeTruthy();
  });
});
