import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * `CardTitle` was always an `h3`. On `/payee` the card is the whole page, so the page
 * carried a second, screen-reader-only `h1` with the same words: a reader heard "Scheduled
 * payments to you" twice, at two levels, with a level skipped in between.
 */
describe("card title heading level", () => {
  function renderTitle(as?: "h1" | "h2" | "h3") {
    render(
      <Card>
        <CardHeader>
          <CardTitle as={as}>Locked funds</CardTitle>
        </CardHeader>
      </Card>
    );
    return screen.getByRole("heading", { name: "Locked funds" });
  }

  it("stays an h3 for a card inside a page that has its own heading", () => {
    expect(renderTitle().tagName).toBe("H3");
  });

  it("becomes the page heading when the card is the page", () => {
    expect(renderTitle("h1").tagName).toBe("H1");
  });

  it("keeps the shared title styling at every level", () => {
    expect(renderTitle("h1").className).toContain("font-display");
  });
});
