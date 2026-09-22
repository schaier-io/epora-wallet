import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewReceiptCard } from "@/components/user/review-panel-sections";

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

  it("keeps a recipient address on one visible line with a copy action", () => {
    const address = `addr_test1${"q".repeat(80)}`;
    render(
      <ReviewReceiptCard
        compact
        receiptTitle="What will happen"
        receiptItems={[
          {
            label: "Recipient",
            value: "2 ADA to addr_test1qq...qqqqqqqq",
            copyValue: address,
            copyLabel: "Copy recipient address"
          }
        ]}
      />
    );

    expect(screen.getByText("2 ADA to addr_test1qq...qqqqqqqq")).toBeInTheDocument();
    expect(screen.queryByText(address)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy recipient address" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("does not paint a preview row green before anything is confirmed", () => {
    const { container } = render(
      <ReviewReceiptCard
        compact
        receiptTitle="What will happen"
        receiptItems={[
          { label: "Starter funds", value: "5 ADA", tone: "success" },
          { label: "Owner", value: "None", tone: "warning" }
        ]}
      />
    );

    expect(container.querySelectorAll('[class*="emerald"]')).toHaveLength(0);
    expect(container.querySelectorAll('[class*="amber"]')).toHaveLength(1);
  });
});
