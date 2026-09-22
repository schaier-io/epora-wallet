import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ProposalSummaryRows } from "./proposal-summary-rows";

const ROWS = [
  { label: "Sends", value: "12.5 ADA" },
  { label: "To", value: "addr_test1qz8x…k2n9" }
];

describe("the proposer's summary rows", () => {
  it("keeps each value next to its own label", () => {
    render(<ProposalSummaryRows rows={ROWS} />);

    const sends = screen.getByText("Sends");
    expect(sends.tagName).toBe("DT");
    // The pair is one element, so a long value cannot weld itself to the next pair's
    // label -- which is what `justify-between` did, on the one string a co-signer
    // compares before signing.
    expect(sends.parentElement).toContainElement(screen.getByText("12.5 ADA"));
    expect(screen.getByText("addr_test1qz8x…k2n9").tagName).toBe("DD");
  });

  /**
   * The two surfaces that show these rows had drifted apart: the signer's copy in
   * `proposal-detail.tsx` used the grid, and the proposer's copy in
   * `create-proposal-panel.tsx` still used the `justify-between` shape the detail panel's
   * own comments had already rejected. Same data, same product, two layouts, one of them
   * recorded as wrong. One definition is what stops that happening again.
   */
  it("is the only place that lays these rows out", () => {
    const dir = "src/components/user/proposals";
    const inliners = readdirSync(dir).filter((entry) => {
      if (!/\.tsx$/.test(entry) || /\.test\.tsx$/.test(entry)) return false;
      if (entry === "proposal-summary-rows.tsx") return false;
      return /summary\.rows\.map/.test(readFileSync(join(dir, entry), "utf8"));
    });

    expect(inliners).toEqual([]);
  });
});
