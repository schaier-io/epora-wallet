import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StateTransitionReview } from "./state-transition-review";

describe("State transition review", () => {
  it("shows complete old and new values from the review, including raw token units", () => {
    render(<StateTransitionReview transition={{
      txBodyHash: "aa".repeat(32), outputIndex: 1,
      changes: [{ path: "state.access.users[0].remaining_allowance[0].quantity", before: "9007199254740992", after: "9007199254740993" }]
    }} />);
    expect(screen.getByText("9007199254740992")).toBeInTheDocument();
    expect(screen.getByText("9007199254740993")).toBeInTheDocument();
    expect(screen.getByText("state.access.users[0].remaining_allowance[0].quantity")).toBeInTheDocument();
  });

  it("states that signing is blocked when no complete review is available", () => {
    render(<StateTransitionReview transition={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Signing is blocked.");
  });

  it("distinguishes a completed empty comparison from a missing review", () => {
    render(<StateTransitionReview transition={{ txBodyHash: "aa".repeat(32), outputIndex: 0, changes: [] }} />);
    expect(screen.getByText("Every State field is unchanged.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
