import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ProductFaqList } from "@/components/user/product-faq-list";

/**
 * The FAQ is a section of the same card as the three "One wallet, many keys" steps, so its
 * heading is their peer: an `h3` at the Title rung.
 *
 * It used to be an `h2` carrying `.eyebrow`. Measured on `/user` at a 320px viewport, the
 * card's outline read 24 / 16 / 16 / 16 / 11 with the level going back UP at the smallest
 * text on the screen: the heading claimed to be a peer of the page's own "Welcome to Epora
 * Wallet" `h2` while sitting inside the card that heading introduces, and 11px is below the
 * 14px body rung.
 */
describe("the pre-connect FAQ heading", () => {
  it("is a level-3 heading, under the card's own h2", () => {
    render(<ProductFaqList />);

    const heading = screen.getByRole("heading", { level: 3, name: "Before you connect" });
    expect(heading.id).toBe("product-faq-heading");
    // The section is named by it, so the level and the name have to stay together.
    expect(screen.getByRole("region", { name: "Before you connect" })).toBeInTheDocument();
  });

  it("carries the same rung as the step headings beside it", () => {
    render(<ProductFaqList />);

    const step = readFileSync(
      "src/components/user/workspace/workspace-onboarding-view.tsx",
      "utf8"
    ).match(/<h3 className="(font-sans text-base[^"]*)"/)?.[1];

    expect(step).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3 }).className).toBe(step);
  });
});
