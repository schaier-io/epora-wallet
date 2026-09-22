import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PayeeCardFallback } from "@/components/payee/payee-card-fallback";

/**
 * Both /payee loading paths render this component: the page's Suspense fallback and
 * lazy-payee-view's dynamic-import loading fallback. Issue #502 made its markup the
 * route's LCP fix: the heading and the note paragraph must paint in the server HTML
 * and never flash away on the way to the live view, so this test pins the exact
 * content the page relies on.
 */
describe("PayeeCardFallback", () => {
  it("renders the card shell the /payee page paints while the view loads", () => {
    render(<PayeeCardFallback />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Scheduled income" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Payments other wallets send to you a little at a time/)
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Preparing your payments…");
  });

  it("carries no refresh control; the live view adds it once a scan exists", () => {
    render(<PayeeCardFallback />);

    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });
});
