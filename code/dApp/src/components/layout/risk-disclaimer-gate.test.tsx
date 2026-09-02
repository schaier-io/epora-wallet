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
// Storage is cleared too, so the session-scoped acceptance never leaks between tests.
afterEach(() => {
  for (const page of Array.from(document.querySelectorAll("main[data-test-page]"))) {
    page.remove();
  }
  window.sessionStorage.clear();
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

    expect(paragraphs).toHaveLength(4);
    expect(paragraphs[0]).toContain("Cardano Preprod test network");
    expect(paragraphs[0]).toContain("Do not use it with real funds");
  });

  // Onboarding needs a way to get spendable test ADA. There is no faucet URL in the repo to
  // link to, so the guidance names the faucet without inventing one.
  it("tells the reader where test ADA comes from", () => {
    render(<RiskDisclaimerGate />);

    const paragraphs = Array.from(
      document.querySelectorAll("#risk-disclaimer-body p")
    ).map((p) => p.textContent ?? "");

    expect(paragraphs[3]).toContain("request test ADA from the Cardano Preprod faucet");
    expect(paragraphs[3]).not.toContain("http");
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

  it("records acceptance only once the button is clicked", () => {
    render(<RiskDisclaimerGate />);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("permission-wallet:risk-acknowledgement")).toBeNull();
  });

  // The old gate held acceptance in React state, so every full reload asked again. It now
  // survives reloads within one browser session: a second mount in the same session (what a
  // reload produces) must stay dismissed.
  it("stays dismissed for the rest of the browser session", () => {
    const first = render(<RiskDisclaimerGate />);
    fireEvent.click(
      screen.getByRole("button", { name: "I understand and accept the risks" })
    );
    first.unmount();

    render(<RiskDisclaimerGate />);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  // Session-scoped, not permanent: wiping the session (what a new browser session is) must
  // bring the mandatory acknowledgement back.
  it("asks again in a new browser session", () => {
    const first = render(<RiskDisclaimerGate />);
    fireEvent.click(
      screen.getByRole("button", { name: "I understand and accept the risks" })
    );
    first.unmount();

    window.sessionStorage.clear();
    render(<RiskDisclaimerGate />);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
