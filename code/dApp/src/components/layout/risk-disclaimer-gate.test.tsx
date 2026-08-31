import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RiskDisclaimerGate } from "@/components/layout/risk-disclaimer-gate";

/**
 * The gate had `role="alertdialog"` and `aria-modal` and nothing behind them. The overlay
 * stopped the mouse and only the mouse: one Tab reached the header logo, and a screen reader
 * could walk the whole page underneath.
 */
function mountPageBehind() {
  const page = document.createElement("main");
  page.dataset.testPage = "";
  page.innerHTML = '<button type="button">Behind the gate</button>';
  document.body.appendChild(page);
  return page;
}

// Remove only what this file added. Clearing `document.body` would take Testing Library's
// own container with it, and its cleanup then throws before any assertion is read.
afterEach(() => {
  for (const page of Array.from(document.querySelectorAll("main[data-test-page]"))) {
    page.remove();
  }
});

describe("risk disclaimer gate", () => {
  // The one sentence a stranger has to act on is "do not use it with real funds". It used to
  // sit third, under two paragraphs of warranty and liability language. jsdom has no layout,
  // so the reachability half of this surface's fix cannot be asserted here -- only the order.
  it("leads with the sentence the reader has to act on", () => {
    render(<RiskDisclaimerGate />);

    const paragraphs = Array.from(
      document.querySelectorAll("#risk-disclaimer-body p")
    ).map((p) => p.textContent ?? "");

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toContain("Cardano Preprod test network");
    expect(paragraphs[0]).toContain("Do not use it with real funds");
  });

  it("makes everything behind it inert", () => {
    const page = mountPageBehind();

    render(<RiskDisclaimerGate />);

    expect(page.hasAttribute("inert")).toBe(true);
  });

  it("leaves itself reachable", () => {
    mountPageBehind();

    render(<RiskDisclaimerGate />);

    const gate = screen.getByRole("alertdialog");
    expect(gate.hasAttribute("inert")).toBe(false);
    expect(
      screen.getByRole("button", { name: "I understand and accept the risks" })
    ).toBeInTheDocument();
  });

  it("hands the page back once the risk is accepted", () => {
    const page = mountPageBehind();

    render(<RiskDisclaimerGate />);
    fireEvent.click(
      screen.getByRole("button", { name: "I understand and accept the risks" })
    );

    expect(page.hasAttribute("inert")).toBe(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
