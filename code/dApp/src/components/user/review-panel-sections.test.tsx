import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewNetworkFee, ReviewReceiptCard } from "@/components/user/review-panel-sections";

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

/**
 * Eight labels in this file hand-rolled an eyebrow at `text-xs uppercase tracking-wide`, which
 * is 12px with 0.025em of tracking. `.eyebrow` is 11px at 0.16em, and the rail's own
 * "Transaction size" label already used it. Measured in the 247px rail before the change: the
 * longest receipt label, "Scheduled payments", goes from 141px to 154px against a 161px row,
 * so it still fits on one line.
 */
describe("ReviewReceiptCard labels", () => {
  it("puts its labels on the eyebrow rung", () => {
    const { container } = render(
      <ReviewReceiptCard
        compact
        receiptTitle="What will happen"
        receiptItems={[{ label: "Recipient", value: "addr_test1..." }]}
      />
    );

    const label = screen.getByText("Recipient");
    expect(label.className).toContain("eyebrow");
    expect(container.querySelectorAll(".uppercase")).toHaveLength(0);
  });
});
