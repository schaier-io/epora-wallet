import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { LazyChunkFallback } from "./lazy-chunk-fallback";

/**
 * Each of the three `dynamic()` boundaries drew this block itself, and each drew the
 * spinner alone: the icon is `aria-hidden`, so the busy region held nothing to read and
 * the row named nothing on screen either.
 */
it("names what is happening beside the spinner", () => {
  const { container } = render(<LazyChunkFallback />);

  expect(screen.getByText("Loading this section…")).toBeInTheDocument();
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
});

it("draws one card per chunk the boundary replaces", () => {
  const { container } = render(<LazyChunkFallback cards={2} />);

  // The skeleton shapes stay hidden; the sentence above them is the readable part.
  expect(container.querySelectorAll(".shadow-panel")).toHaveLength(2);
});
