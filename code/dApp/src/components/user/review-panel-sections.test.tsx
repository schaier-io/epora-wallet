import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewNetworkFee } from "@/components/user/review-panel-sections";

// Every transaction builder computes `estimatedFeeLovelace`, and until this component
// existed no surface read it: the user was asked to sign without being told the cost.
describe("ReviewNetworkFee", () => {
  it("shows the fee in ADA, not in lovelace", () => {
    render(<ReviewNetworkFee estimatedFeeLovelace="182397" />);

    expect(screen.getByText("Network fee")).toBeInTheDocument();
    expect(screen.getByText(/0\.182397 ₳/)).toBeInTheDocument();
    // The raw lovelace integer must not be what the user reads.
    expect(screen.queryByText(/^182397/)).not.toBeInTheDocument();
  });

  it("says the fee is on top of the amount, so it is not read as included", () => {
    render(<ReviewNetworkFee estimatedFeeLovelace="182397" />);
    expect(screen.getByText(/on top of the amount above/)).toBeInTheDocument();
  });

  it("renders nothing when the builder produced no estimate", () => {
    const { container } = render(<ReviewNetworkFee />);
    expect(container).toBeEmptyDOMElement();
  });
});
