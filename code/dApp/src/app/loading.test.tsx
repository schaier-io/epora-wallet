import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootLoading from "@/app/loading";
import UserLoading from "@/app/user/loading";

/**
 * The two route-level loading states each had one half of the same pattern and neither had
 * both. `app/loading.tsx` showed "Loading wallet…" with no live region, so nothing was ever
 * announced. `app/user/loading.tsx` carried `aria-live="polite"` over a wall of
 * `aria-hidden` skeletons, so a reader was told a region had updated and found it empty.
 *
 * The rule is the pairing, not the wording: a live region must have something to read, and
 * text that reports progress must sit in one. Wording is free to change; a region with
 * nothing in it is always wrong.
 */
const LOADING_STATES = [
  { name: "app/loading.tsx", Component: RootLoading },
  { name: "app/user/loading.tsx", Component: UserLoading }
];

describe.each(LOADING_STATES)("$name", ({ Component }) => {
  it("marks itself busy", () => {
    const { container } = render(<Component />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("gives its live region something to announce", () => {
    const { container } = render(<Component />);
    const region = container.querySelector('[aria-live]');
    expect(region).not.toBeNull();
    // `aria-hidden` subtrees are skipped by assistive tech, so they cannot be what is read.
    for (const hidden of Array.from(region!.querySelectorAll('[aria-hidden="true"]'))) {
      hidden.remove();
    }
    expect(region!.textContent?.trim()).not.toBe("");
  });
});
