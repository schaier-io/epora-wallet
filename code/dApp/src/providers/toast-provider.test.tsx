import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/providers/toast-provider";

/**
 * Every toast hides itself on a timer: 5.2s, or 8s for an error. The wallet's own failure
 * string goes into one of those errors (`wallet-connect-error-bridge.tsx:36`) and is written
 * nowhere else, so a reader who looked away lost it with no way back. WCAG 2.2.1 asks for a
 * way to hold timed content; hovering or focusing the stack is that way.
 */
const TITLE = "Wallet connection failed";

function Trigger() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.error({ title: TITLE })}>
      raise
    </button>
  );
}

function renderWithToast() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "raise" }));
  return screen.getByRole("alert");
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast auto-dismiss", () => {
  it("hides an untouched toast once its timer runs out", () => {
    renderWithToast();

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("holds the toast while the pointer is over it", () => {
    const alert = renderWithToast();

    // React synthesises `onMouseEnter` from `mouseover`, so the event has to be the one the
    // browser actually sends. The host is `pointer-events-none`; the toast is the target.
    fireEvent.mouseOver(alert, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(TITLE);
  });

  it("lets the timer run again once the pointer leaves", () => {
    const alert = renderWithToast();

    fireEvent.mouseOver(alert, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    fireEvent.mouseOut(alert, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("holds the toast while focus is inside it", () => {
    renderWithToast();

    // A keyboard reader arrives at the dismiss button. Taking focus there must stop the
    // toast disappearing out from under the key they are about to press.
    act(() => {
      screen.getByRole("button", { name: "Dismiss notification" }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(TITLE);
  });
});
