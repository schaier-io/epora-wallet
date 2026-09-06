import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { SparkleEasterEgg } from "@/components/layout/sparkle-easter-egg";

function renderTerminal() {
  const page = document.createElement("main");
  page.dataset.testPage = "";
  page.innerHTML = '<button type="button">Behind the dialog</button>';
  document.body.appendChild(page);

  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <SparkleEasterEgg open onOpenChange={() => {}} />
    </NextIntlClientProvider>
  );

  return { cleanup: () => page.remove() };
}

describe("sparkle terminal", () => {
  it("lets Tab reach the dialog's focus trap, and still swallows typing", () => {
    // The prompt stops propagation so typing does not trip global shortcuts.
    // React stops the native event too, and the dialog's focus trap listens on
    // window, so swallowing Tab here let it walk out of the dialog into the page
    // behind the overlay. This watches the same window boundary the trap uses.
    const { cleanup } = renderTerminal();
    const reachedWindow: string[] = [];
    const watch = (event: KeyboardEvent) => reachedWindow.push(event.key);
    window.addEventListener("keydown", watch);

    try {
      const prompt = screen.getByRole("textbox");
      prompt.focus();

      fireEvent.keyDown(prompt, { key: "Tab" });
      fireEvent.keyDown(prompt, { key: "k" });

      expect(reachedWindow).toContain("Tab");
      expect(reachedWindow).not.toContain("k");
    } finally {
      window.removeEventListener("keydown", watch);
      cleanup();
    }
  });
});
