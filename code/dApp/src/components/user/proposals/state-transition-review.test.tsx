import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StateTransitionReview } from "./state-transition-review";

describe("State transition review", () => {
  it("shows complete old and new values from the review, including raw token units", () => {
    render(<StateTransitionReview transition={{
      txBodyHash: "aa".repeat(32), outputIndex: 1,
      changes: [{ path: "state.access.users[0].remaining_allowance[0].quantity", before: "9007199254740992", after: "9007199254740993" }]
    }} />);
    expect(screen.getByText("Access / Person 1 / Remaining allowance 1 / Amount")).toBeInTheDocument();
    expect(screen.getByText("9007199254740993 base units")).toBeInTheDocument();
    expect(screen.getByText("Contract details").closest("details")).not.toHaveAttribute("open");
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

it("formats verified timestamps while retaining exact contract values", () => {
  render(<StateTransitionReview transition={{ txBodyHash: "aa", outputIndex: 0, changes: [
    { path: "state.streaming_payments[0].end_date", before: "1700000000000", after: "1800000000000" },
    { path: "state.access.users[0].is_admin", before: "false", after: "true" },
    { path: "state.future_field", before: null, after: "opaque" },
    { path: "state.wallet_name.text", before: "false", after: "true" }
  ] }} />);
  expect(screen.getByText(/Jan 15, 2027 AD.*08:00:00\.000.*UTC/)).toBeInTheDocument();
  expect(screen.getByText("1800000000000")).toBeInTheDocument();
  expect(screen.getByText("Yes")).toBeInTheDocument();
  expect(screen.getAllByText("true").length).toBe(3);
  expect(screen.getByText("future_field")).toBeInTheDocument();
});

it("shows distinct millisecond times for the actual recovery unlock Option path", () => {
  const path = "state.access.beneficiaries[0].unlock_after.fields[0]";
  render(<StateTransitionReview transition={{ txBodyHash: "aa", outputIndex: 0, changes: [
    { path, before: "1800000000000", after: "1800000000999" }
  ] }} />);
  expect(screen.getByText("Access / Recovery recipient 1 / Unlock time")).toBeInTheDocument();
  expect(screen.getByText(/08:00:00\.000.*UTC/)).toBeVisible();
  expect(screen.getByText(/08:00:00\.999.*UTC/)).toBeVisible();
  expect(screen.getByText(path)).toBeInTheDocument();
  expect(screen.getByText("1800000000999")).toBeInTheDocument();
});
