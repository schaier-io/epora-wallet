import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/user");
vi.mock("next/navigation", () => ({
  usePathname: () => pathname()
}));

const { SiteFooter } = await import("@/components/layout/site-footer");

/**
 * The footer's second row is a list of links joined by "·", and two of its parts are
 * conditional: the "Press ? for shortcuts" hint only exists from `sm` up, and the
 * "Wallet home" link only exists off `/user`. On `/user` at phone width both were gone and
 * the row still opened with its separator: "· Catalyst proposal".
 *
 * jsdom applies no media queries, so visibility below `sm` cannot be observed here. The
 * class string is what decides it, and asserting it is asserting the rule: a separator is
 * gated to `sm` exactly when the only thing that can precede it is.
 */
function trailingSeparator() {
  const separators = Array.from(document.querySelectorAll('[aria-hidden="true"]')).filter(
    (node) => node.textContent?.trim() === "·"
  );
  return separators.at(-1);
}

describe("footer separators", () => {
  it("gates the separator to sm on /user, where nothing else precedes it", () => {
    pathname.mockReturnValue("/user");
    render(<SiteFooter />);

    expect(screen.queryByRole("link", { name: "Wallet home" })).toBeNull();
    expect(trailingSeparator()?.className).toContain("hidden");
    expect(trailingSeparator()?.className).toContain("sm:inline");
  });

  it("shows the separator at every width once Wallet home precedes it", () => {
    pathname.mockReturnValue("/payee");
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Wallet home" })).toBeTruthy();
    expect(trailingSeparator()?.className).not.toContain("hidden");
  });
});
