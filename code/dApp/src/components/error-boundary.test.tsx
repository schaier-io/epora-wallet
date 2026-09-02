import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/error-boundary";

/**
 * The fallback used to render `Error.message` as its only sentence. That string is written
 * for a developer -- "Cannot read properties of undefined (reading 'datum')" -- so a reader
 * whose wallet page had just broken was handed a stack fragment instead of an explanation.
 *
 * The rule held here is that a written sentence is what the reader sees, and the raw
 * message is not on the page at all. The wording is free to change; a screen whose prose
 * is an exception message is always wrong.
 */
const RAW = "Cannot read properties of undefined (reading 'datum')";

function Boom(): never {
  throw new Error(RAW);
}

// React logs caught errors to console.error. Silence it so a passing run stays readable.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error boundary fallback", () => {
  it("shows a written sentence, not the exception message", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toContain(RAW);
    expect(alert.textContent).toContain("This part of the page stopped working");
  });

  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("all good")).toBeTruthy();
  });
});
