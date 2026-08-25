import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

const { KeyboardShortcutsHelp } = await import("@/components/layout/shortcuts-help");

/**
 * `c` navigated to the wallet-creation flow and `g h` navigated home while the risk gate was
 * still up. The handler only skipped inputs and textareas, and the gate's dismiss button is
 * a `<button>`, so nothing stopped it.
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
