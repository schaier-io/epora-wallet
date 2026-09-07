import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SparkleEasterEgg } from "./sparkle-easter-egg";

const listeners: Array<(event: KeyboardEvent) => void> = [];

afterEach(() => {
  for (const listener of listeners.splice(0)) window.removeEventListener("keydown", listener);
});

it("lets Tab reach the dialog's focus trap while other keys stay local", () => {
  // The prompt stopped every key but Escape, so Tab never reached the window listener
  // that keeps focus inside the dialog, and focus walked out to the page behind.
  const seen = vi.fn();
  const listener = (event: KeyboardEvent) => {
    seen(event.key);
  };
  listeners.push(listener);
  window.addEventListener("keydown", listener);
  render(<SparkleEasterEgg open onOpenChange={() => {}} />);
  const input = screen.getByRole("textbox");

  fireEvent.keyDown(input, { key: "a" });
  expect(seen).not.toHaveBeenCalled();

  fireEvent.keyDown(input, { key: "Tab" });
  expect(seen).toHaveBeenCalledWith("Tab");
});
