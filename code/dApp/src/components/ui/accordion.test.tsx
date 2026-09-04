import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

it("lets open content grow after Radix measures its animation", () => {
  const { container } = render(
    <Accordion type="single" defaultValue="details">
      <AccordionItem value="details">
        <AccordionTrigger>Details</AccordionTrigger>
        <AccordionContent>Content</AccordionContent>
      </AccordionItem>
    </Accordion>
  );

  expect(container.querySelector('[data-slot="accordion-content"] > div')).not.toHaveClass(
    "h-(--radix-accordion-content-height)"
  );
});
