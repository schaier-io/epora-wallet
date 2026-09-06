import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";

/**
 * jsdom has no layout, so it cannot see the clipping itself: it reports every
 * height as 0. What it can see is the class that caused it. The wrapper keeps
 * `overflow-hidden`, so pinning the inner div to
 * `--radix-accordion-content-height` (measured once, when the panel opens) cut
 * off anything that grew afterwards, and the workspace uses this for editor
 * sections where rows are added while the section is open.
 */
describe("accordion content", () => {
  it("does not pin its content to the height measured at open time", () => {
    render(
      <Accordion type="single" collapsible defaultValue="section">
        <AccordionItem value="section">
          <AccordionTrigger>People</AccordionTrigger>
          <AccordionContent>
            <p>A row that may be joined by more rows later.</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    const content = screen.getByText("A row that may be joined by more rows later.")
      .parentElement!;

    expect(content.className).not.toMatch(/\bh-\(--radix-accordion-content-height\)/);
  });
});
