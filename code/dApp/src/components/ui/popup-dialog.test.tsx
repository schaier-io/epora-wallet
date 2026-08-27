import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PopupDialog } from "./popup-dialog";

function DialogFixture() {
  const [open, setOpen] = useState(false);
  const [renderCount, setRenderCount] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open settings
      </button>
      <PopupDialog open={open} onOpenChange={setOpen} title="Settings">
        <button type="button">Save settings</button>
        <button type="button" onClick={() => setRenderCount((count) => count + 1)}>
          Rerender dialog {renderCount}
        </button>
      </PopupDialog>
    </>
  );
}

describe("PopupDialog", () => {
  it("isolates the background and restores focus after Escape", async () => {
    const view = render(<DialogFixture />);
    const trigger = screen.getByRole("button", { name: "Open settings" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    });
    expect(view.container).toHaveAttribute("inert");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(view.container).not.toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
  });

  it("keeps focus and background isolation across parent rerenders", async () => {
    const view = render(<DialogFixture />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    const rerenderButton = await screen.findByRole("button", { name: "Rerender dialog 0" });
    rerenderButton.focus();
    fireEvent.click(rerenderButton);

    expect(await screen.findByRole("button", { name: "Rerender dialog 1" })).toHaveFocus();
    expect(view.container).toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });
});
