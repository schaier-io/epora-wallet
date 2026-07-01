import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

// Smoke test that proves the vitest + jsdom + Testing Library harness works
// end-to-end (render a real app component, query the DOM, assert with jest-dom).
describe("Button", () => {
  it("renders its children as an accessible button", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("applies the variant + size classes via cva", () => {
    render(
      <Button variant="destructive" size="sm">
        Delete
      </Button>
    );
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("bg-destructive");
    expect(button.className).toContain("h-9");
  });

  it("forwards native button attributes like disabled", () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole("button", { name: "Nope" })).toBeDisabled();
  });
});
