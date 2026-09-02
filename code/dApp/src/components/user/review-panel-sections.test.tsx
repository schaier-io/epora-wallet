import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewCosts, ReviewReceiptCard } from "@/components/user/review-panel-sections";
import { buildPresignCostRows } from "@/lib/user-flow/presign-costs";

// Every transaction builder computes `estimatedFeeLovelace`, and until these cost rows
// existed no surface read it: the user was asked to sign without being told the cost.
describe("ReviewCosts", () => {
  it("shows the fee in ADA, not in lovelace, tagged as estimated", () => {
    render(
      <ReviewCosts rows={buildPresignCostRows({ estimatedFeeLovelace: "182397" })} />
    );

    expect(screen.getByText("Network fee")).toBeInTheDocument();
    expect(screen.getByText(/0\.182397 ₳/)).toBeInTheDocument();
    // The raw lovelace integer must not be what the user reads.
    expect(screen.queryByText(/^182397/)).not.toBeInTheDocument();
    expect(screen.getByText("estimated")).toBeInTheDocument();
  });

  it("says the fee is on top of the amount, so it is not read as included", () => {
    render(
      <ReviewCosts rows={buildPresignCostRows({ estimatedFeeLovelace: "182397" })} />
    );
    expect(screen.getByText(/on top of the amount above/)).toBeInTheDocument();
  });

  it("marks the fee-derived remainder estimated and the refreshed balance exact", () => {
    render(
      <ReviewCosts
        rows={buildPresignCostRows({
          estimatedFeeLovelace: "182397",
          walletBalanceLovelace: "10000000"
        })}
      />
    );

    expect(screen.getByText("Wallet balance now")).toBeInTheDocument();
    expect(screen.getByText("Wallet balance after the fee")).toBeInTheDocument();
    expect(screen.getByText(/9\.817603 ₳/)).toBeInTheDocument();
    // One tag on the fee, one on the remainder; the exact balance carries none.
    expect(screen.getAllByText("estimated")).toHaveLength(2);
  });

  it("skips amounts it was not given instead of showing placeholders", () => {
    render(
      <ReviewCosts rows={buildPresignCostRows({ walletBalanceLovelace: "10000000" })} />
    );

    expect(screen.queryByText("Network fee")).not.toBeInTheDocument();
    expect(screen.queryByText("Wallet balance after the fee")).not.toBeInTheDocument();
    expect(screen.queryByText("Deposit set aside")).not.toBeInTheDocument();
    expect(screen.getByText("Wallet balance now")).toBeInTheDocument();
  });

  it("renders nothing when no amount is available", () => {
    const { container } = render(<ReviewCosts rows={buildPresignCostRows({})} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Eight labels in this file hand-rolled an eyebrow at `text-xs uppercase tracking-wide`, which
 * is 12px with 0.025em of tracking. `.eyebrow` is 11px at 0.16em. Measured in the 247px rail
 * before the change: the longest receipt label, "Scheduled payments", goes from 141px to 154px
 * against a 161px row, so it still fits on one line.
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
