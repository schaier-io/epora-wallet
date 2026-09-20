import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, buttonVariants } from "./button";

/**
 * Tailwind v4 emits standalone `scale` / `translate` / `rotate` properties, so a
 * `transition-[...,transform,...]` list never animates `active:scale-[0.96]`. Disabled
 * primary used to keep `--primary` at 50% opacity, which outshone live controls.
 */
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

describe("buttonVariants", () => {
  it("transitions v4 transform properties plus color, shadow, and opacity", () => {
    const classes = buttonVariants();
    expect(
      classes.includes("transition-transform") ||
        classes.includes("translate,scale,rotate")
    ).toBe(true);
    expect(classes).toContain("duration-200");
    expect(classes).toContain("ease-[cubic-bezier(0.22,1,0.36,1)]");
    expect(classes).toContain("active:duration-75");
  });

  it("mutes a disabled primary without killing pointer events", () => {
    const classes = buttonVariants();
    expect(classes).toContain("disabled:bg-muted");
    expect(classes).toContain("disabled:cursor-not-allowed");
    expect(classes).not.toContain("disabled:pointer-events-none");
  });

  it("offsets the focus ring against the card surface", () => {
    const classes = buttonVariants();
    expect(classes).toContain("ring-offset-card");
    expect(classes).not.toContain("ring-offset-background");
  });
});
