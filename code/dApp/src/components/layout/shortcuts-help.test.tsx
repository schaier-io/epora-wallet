import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

const { KeyboardShortcutsHelp } = await import("@/components/layout/shortcuts-help");

/**
 * `g c` navigates to the wallet-creation flow and `g h` navigates home. Both used to fire
 * while the risk gate was still up: the handler only skipped inputs and textareas, and the
 * gate's dismiss button is a `<button>`, so nothing stopped it.
 *
 * Creating a wallet answered to a bare `c` until it moved behind the `g` prefix. `c` is a
 * browse-mode quick-nav key in NVDA and JAWS.
 */
function openModal() {
  const modal = document.createElement("div");
  modal.setAttribute("role", "alertdialog");
  modal.setAttribute("aria-modal", "true");
  modal.dataset.testModal = "";
  document.body.appendChild(modal);
  return modal;
}

afterEach(() => {
  push.mockClear();
  for (const modal of Array.from(document.querySelectorAll("[data-test-modal]"))) {
    modal.remove();
  }
});

describe("keyboard shortcuts behind a modal", () => {
  it("does not create a wallet while a modal owns the screen", () => {
    render(<KeyboardShortcutsHelp />);
    openModal();

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "c" });

    expect(push).not.toHaveBeenCalled();
  });

  it("does not navigate on g then h while a modal owns the screen", () => {
    render(<KeyboardShortcutsHelp />);
    openModal();

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });

    expect(push).not.toHaveBeenCalled();
  });

  it("still creates a wallet once the modal is gone", () => {
    render(<KeyboardShortcutsHelp />);

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "c" });

    expect(push).toHaveBeenCalledWith("/user?action=create-wallet&step=configure");
  });

  it("still navigates on g then h once the modal is gone", () => {
    render(<KeyboardShortcutsHelp />);

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "h" });

    expect(push).toHaveBeenCalledWith("/user?step=overview");
  });
});

describe("quick-nav letters", () => {
  it("does not create a wallet on a bare c", () => {
    render(<KeyboardShortcutsHelp />);

    fireEvent.keyDown(window, { key: "c" });

    expect(push).not.toHaveBeenCalled();
  });

  it("forgets the g prefix after any other key", () => {
    render(<KeyboardShortcutsHelp />);

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "x" });
    fireEvent.keyDown(window, { key: "c" });

    expect(push).not.toHaveBeenCalled();
  });
});
