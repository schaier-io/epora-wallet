import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Select } from "@/components/ui/select";

/**
 * There were 18 native selects across four hand-written class strings. Four omitted the
 * focus ring and fell back to the browser outline while the input beside them drew the app
 * ring. The point of the primitive is that the chrome cannot be forgotten.
 */
describe("Select", () => {
  it("carries the app focus ring, not the browser outline", () => {
    render(
      <Select aria-label="Path">
        <option value="a">A</option>
      </Select>
    );

    const control = screen.getByLabelText("Path");
    expect(control.className).toContain("focus-visible:ring-2");
    expect(control.className).toContain("focus-visible:outline-none");
  });

  it("matches Input's invalid treatment", () => {
    render(
      <Select aria-label="Path" aria-invalid>
        <option value="a">A</option>
      </Select>
    );

    expect(screen.getByLabelText("Path").className).toContain(
      "aria-[invalid=true]:border-rose-500/60"
    );
  });

  it("lets a caller override the height without losing the ring", () => {
    render(
      <Select aria-label="Path" className="h-8 w-auto">
        <option value="a">A</option>
      </Select>
    );

    const control = screen.getByLabelText("Path");
    // tailwind-merge keeps the last height and drops the primitive's h-10.
    expect(control.className).toContain("h-8");
    expect(control.className).not.toContain("h-10");
    expect(control.className).toContain("focus-visible:ring-2");
  });
});
