import { fireEvent, render, screen } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DISCORD_INVITE_URL, GITHUB_NEW_ISSUE_URL } from "@/lib/site-links";

const pathname = vi.fn(() => "/user");
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push: vi.fn() })
}));

const { SiteFooter } = await import("@/components/layout/site-footer");
const { KeyboardShortcutsHelp } = await import("@/components/layout/shortcuts-help");
const { shortcutsHelpOpenAtom } = await import("@/components/layout/shortcuts-help.atoms");

/**
 * The footer's second row is a list of links joined by "·": Discord, Report an
 * issue, and Catalyst. There is no Wallet home link: the nav's "Smart wallet" link and
 * the logo already reach that page on every route.
 */
function footerSeparators() {
  return Array.from(document.querySelectorAll('[aria-hidden="true"]')).filter(
    (node) => node.textContent?.trim() === "·"
  );
}

afterEach(() => {
  // The open flag is a module-global atom shared with the shortcuts dialog; a click in
  // one test must not leak an open dialog into the next.
  getDefaultStore().set(shortcutsHelpOpenAtom, false);
});

describe("footer separators", () => {
  it("links Discord and issues, with no Wallet home link duplicating the nav", () => {
    pathname.mockReturnValue("/user");
    render(<SiteFooter />);

    expect(screen.getByRole("link", { name: "Operator: 41BIT LLC" })).toHaveAttribute("href", "/legal");
    expect(screen.queryByRole("link", { name: "Wallet home" })).toBeNull();
    expect(screen.getByRole("link", { name: "Discord" })).toHaveAttribute(
      "href",
      DISCORD_INVITE_URL
    );
    expect(screen.getByRole("link", { name: "Report an issue" })).toHaveAttribute(
      "href",
      GITHUB_NEW_ISSUE_URL
    );
    expect(footerSeparators()).toHaveLength(2);
  });

});

describe("shortcuts affordance", () => {
  /**
   * The `?` key answers only to a keyboard. The footer button is the one pointer and
   * touch path to the shortcuts dialog, so its discovery surface is part of the contract:
   * the rendered hint doubles as the button's label, and `aria-haspopup` tells readers a
   * dialog opens rather than a navigation happening.
   */
  it("renders a Press-?-for-shortcuts button announcing its dialog", () => {
    render(<SiteFooter />);

    const button = screen.getByRole("button", { name: "Press ? for shortcuts" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("opens the shortcuts dialog when pressed", () => {
    render(
      <>
        <SiteFooter />
        <KeyboardShortcutsHelp />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Press ? for shortcuts" }));

    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("closes the opened dialog on Escape", () => {
    render(
      <>
        <SiteFooter />
        <KeyboardShortcutsHelp />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "Press ? for shortcuts" }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
  });
});
