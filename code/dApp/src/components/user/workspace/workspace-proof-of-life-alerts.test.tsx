import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceProofOfLifeAlerts } from "./workspace-proof-of-life-alerts";
import {
  selectProofOfLifeAlerts,
  type ProofOfLifeAlert
} from "@/lib/user-flow/proof-of-life-alert";

const DEADLINE_MS = 1_760_000_000_000;

function approachingAlert(overrides: Partial<ProofOfLifeAlert> = {}): ProofOfLifeAlert {
  return {
    unit: "unit-soon",
    walletName: "Due soon",
    state: "approaching",
    deadlineMs: DEADLINE_MS,
    remainingMs: 2 * 24 * 60 * 60 * 1000,
    canRenew: true,
    ...overrides
  };
}

describe("WorkspaceProofOfLifeAlerts", () => {
  it("renders nothing when no wallet needs attention", () => {
    render(<WorkspaceProofOfLifeAlerts alerts={[]} onRenew={vi.fn()} />);

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("names the wallet and shows the deadline date for an approaching timer", () => {
    render(<WorkspaceProofOfLifeAlerts alerts={[approachingAlert()]} onRenew={vi.fn()} />);

    expect(screen.getByText(/Due soon: proof of life ends Oct/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh proof of life for Due soon" })
    ).toBeInTheDocument();
  });

  it("says a lapsed timer ran out and still offers the renewal", () => {
    render(
      <WorkspaceProofOfLifeAlerts
        alerts={[approachingAlert({ state: "overdue", walletName: "Ran out", unit: "unit-late" })]}
        onRenew={vi.fn()}
      />
    );

    expect(screen.getByText(/Ran out: proof of life ran out Oct/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh proof of life for Ran out" })
    ).toBeInTheDocument();
  });

  it("offers no renewal button when the signer cannot renew that wallet", () => {
    render(
      <WorkspaceProofOfLifeAlerts
        alerts={[approachingAlert({ canRenew: false })]}
        onRenew={vi.fn()}
      />
    );

    expect(screen.getByText(/Due soon: proof of life ends Oct/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renewing a row routes that wallet's unit to the renewal handler", () => {
    const onRenew = vi.fn();
    render(
      <WorkspaceProofOfLifeAlerts
        alerts={[
          approachingAlert(),
          approachingAlert({ state: "overdue", walletName: "Ran out", unit: "unit-late" })
        ]}
        onRenew={onRenew}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh proof of life for Ran out" })
    );

    expect(onRenew).toHaveBeenCalledExactlyOnceWith("unit-late");
  });

  it("renders the rows in the order given, so the caller decides urgency", () => {
    render(
      <WorkspaceProofOfLifeAlerts
        alerts={[
          approachingAlert({ unit: "a", walletName: "A", remainingMs: 2 * 24 * 60 * 60 * 1000 }),
          approachingAlert({ unit: "b", walletName: "B", remainingMs: 1 * 24 * 60 * 60 * 1000 })
        ]}
        onRenew={vi.fn()}
      />
    );
    const rows = screen.getAllByText(/proof of life (ends|ran out) Oct/);

    expect(rows[0].textContent).toContain("A");
    expect(rows[1].textContent).toContain("B");
  });

  it("surfaces a Some(0) wallet as an overdue row with its epoch-0 deadline", () => {
    // `unlock_time = Some(0)` is a real, already-lapsed on-chain deadline, so the picker
    // must show the ran-out row (never silence). The fixture flows through the real
    // selection so the test covers the whole path from the decoded datum to the row.
    const NOW = 1_760_000_000_000;
    const [alert]: ProofOfLifeAlert[] = selectProofOfLifeAlerts(
      [
        {
          unit: "unit-zero",
          walletName: "Lapsed at mint",
          proofOfLifeUnlockTimeMode: "some",
          proofOfLifeUnlockTime: "0",
          canRenew: true
        }
      ],
      NOW
    );

    expect(alert.state).toBe("overdue");
    render(<WorkspaceProofOfLifeAlerts alerts={[alert!]} onRenew={vi.fn()} />);

    expect(screen.getByText(/Lapsed at mint: proof of life ran out/)).toBeInTheDocument();
    expect(screen.getByText(/1970/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh proof of life for Lapsed at mint" })
    ).toBeInTheDocument();
  });
});
