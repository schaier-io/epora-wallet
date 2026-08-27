import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InfoHint } from "@/components/ui/info-hint";

/**
 * These 16 hints were tooltips. A tooltip opens on hover and focus and nothing else, so on a
 * phone the ⓘ button did nothing at all when tapped.
 */
describe("info hint", () => {
  it("opens on click", () => {
    render(<InfoHint label="More about spending limits">A daily cap, in ADA.</InfoHint>);

    expect(screen.queryByText("A daily cap, in ADA.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More about spending limits" }));

    expect(screen.getByText("A daily cap, in ADA.")).toBeInTheDocument();
  });

  it("does not activate whatever it sits inside", () => {
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <InfoHint label="More about spending limits">A daily cap, in ADA.</InfoHint>
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "More about spending limits" }));

    expect(screen.getByText("A daily cap, in ADA.")).toBeInTheDocument();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    render(<InfoHint label="More about spending limits">A daily cap, in ADA.</InfoHint>);

    fireEvent.click(screen.getByRole("button", { name: "More about spending limits" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(screen.queryByText("A daily cap, in ADA.")).not.toBeInTheDocument();
  });

  it("does not claim the screen as a modal, so shortcuts keep working behind it", () => {
    render(<InfoHint label="More about spending limits">A daily cap, in ADA.</InfoHint>);

    fireEvent.click(screen.getByRole("button", { name: "More about spending limits" }));

    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  });
});
