import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PopupDialog } from "@/components/ui/popup-dialog";

/**
 * The trap matched only its two boundaries. Clicking any non-focusable area inside the
 * dialog leaves `activeElement` on `<body>`, which is neither, so the next Tab fell through
 * to whatever sat behind the overlay.
 */
function mountPageBehind() {
  const page = document.createElement("main");
  page.dataset.testPage = "";
  page.innerHTML = '<button type="button">Behind the dialog</button>';
  document.body.appendChild(page);
  return page.querySelector("button")!;
}

// Remove only what this file added; clearing `document.body` takes Testing Library's own
// container with it and its cleanup then throws before any assertion is read.
afterEach(() => {
  for (const page of Array.from(document.querySelectorAll("main[data-test-page]"))) {
    page.remove();
  }
});

function renderDialog() {
  return render(
    <PopupDialog open onOpenChange={() => {}} title="Keyboard shortcuts">
      <p>Some prose with nothing focusable in it.</p>
      <button type="button">Inside first</button>
      <button type="button">Inside last</button>
    </PopupDialog>
  );
}

describe("popup dialog focus trap", () => {
  it("pulls focus back in when Tab is pressed from outside", () => {
    mountPageBehind();
    renderDialog();

    // What a click on the dialog's own prose leaves behind.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(window, { key: "Tab" });

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("sends Shift+Tab from outside to the last control, not the first", () => {
    mountPageBehind();
    renderDialog();

    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inside last" }));
  });

  it("never lands on the page behind the overlay", () => {
    const behind = mountPageBehind();
    renderDialog();

    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "Tab" });

    expect(document.activeElement).not.toBe(behind);
  });
});

/**
 * The backdrop closed the dialog whenever a click landed on it, even when the press had
 * started inside: selecting text and releasing over the backdrop dismissed the dialog.
 * The inner "pressed inside" flag was reset by the outer handler on the same bubble.
 */
describe("popup dialog backdrop", () => {
  function renderWithBackdrop() {
    const onOpenChange = vi.fn();
    render(
      <PopupDialog open onOpenChange={onOpenChange} title="Connect">
        <p>Prose to select</p>
      </PopupDialog>
    );
    return { onOpenChange, backdrop: screen.getByRole("dialog").parentElement! };
  }

  it("stays open when a press that started inside is released on the backdrop", () => {
    const { onOpenChange, backdrop } = renderWithBackdrop();
    fireEvent.pointerDown(screen.getByText("Prose to select"));
    fireEvent.click(backdrop);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes on a click that starts and ends on the backdrop", () => {
    const { onOpenChange, backdrop } = renderWithBackdrop();
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

/**
 * `onOpenChange` is an inline arrow at every real call site, so it is a new function on each
 * parent render. It reached the focus effect's dependency list through `handleClose`, so the
 * effect tore down and re-ran whenever the parent rendered, and its cleanup returns focus to
 * the element that opened the dialog. `WalletConnectionDialog` re-renders several times right
 * after it opens (it refreshes the wallet list, then reports each connect state), so the
 * caret was pulled back to the trigger while someone was still using the dialog.
 */
describe("popup dialog focus across parent renders", () => {
  function DialogWithChangingCallback({ label }: { label: string }) {
    return (
      <PopupDialog open onOpenChange={() => {}} title="Connect">
        <input aria-label="Wallet address" />
        <p>{label}</p>
      </PopupDialog>
    );
  }

  it("leaves focus where the user put it when the parent re-renders", () => {
    vi.useFakeTimers();
    try {
      // The dialog restores focus to whatever was focused when it opened, so the bug only
      // shows with a real trigger behind it.
      const trigger = mountPageBehind();
      trigger.focus();

      const { rerender } = render(<DialogWithChangingCallback label="Scanning" />);
      // Initial focus is deferred to a zero-delay timer so the content mounts first.
      act(() => {
        vi.runOnlyPendingTimers();
      });

      const field = screen.getByLabelText("Wallet address");
      field.focus();
      expect(document.activeElement).toBe(field);

      rerender(<DialogWithChangingCallback label="Found 2 wallets" />);

      expect(document.activeElement).toBe(field);
      expect(document.activeElement).not.toBe(trigger);
    } finally {
      vi.useRealTimers();
    }
  });
});
