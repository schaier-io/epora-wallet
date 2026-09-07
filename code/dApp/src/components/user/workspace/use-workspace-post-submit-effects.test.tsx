import { render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspacePostSubmitEffects } from "@/components/user/workspace/use-workspace-post-submit-effects";
import { schedulePostSubmitRefresh } from "@/components/user/workspace/workspace-transaction-refresh";
import type { StateFormState } from "@/lib/contracts/state-form";
import type { DetectedSttInfo } from "@/lib/mesh/detection";

const EMPTY_DETECTION: DetectedSttInfo = {
  policyId: "",
  assetNameHex: "",
  scriptAddress: "",
  sttUtxos: [],
  tokens: []
};

const WALLET_A = "addr_test_wallet_a";
const WALLET_B = "addr_test_wallet_b";

// Only the post-submit poll's own dependencies; the rest of the workspace ctx is
// not reachable from these effects.
function createRefreshSpies() {
  return {
    refreshLockedContractUtxos: vi.fn(() => Promise.resolve()),
    refreshWalletBalance: vi.fn(() => Promise.resolve()),
    refreshPermissionWalletSummaries: vi.fn(() => Promise.resolve()),
    refreshDetectedTokens: vi.fn(() => Promise.resolve(EMPTY_DETECTION))
  };
}

type RefreshSpies = ReturnType<typeof createRefreshSpies>;

/**
 * Renders the effects with a live timers ref and schedules the poll exactly as a
 * submit does, so the test exercises the real timer lifetime rather than a copy
 * of it.
 */
function Harness({
  lockingContractAddress,
  spies
}: {
  lockingContractAddress: string;
  spies: RefreshSpies;
}) {
  const postSubmitRefreshTimersRef = useRef<number[]>([]);
  const mintCelebrationRef = useRef<string | null>(null);
  const scheduledRef = useRef(false);

  useWorkspacePostSubmitEffects({
    lockingContractAddress,
    mintCelebrationRef,
    mintConfirmation: null,
    mintStateForm: { walletName: "" } as unknown as StateFormState,
    mintedWalletName: "",
    postSubmitRefreshTimersRef,
    setMintCelebration: () => {}
  });

  useEffect(() => {
    // Schedule once, as a submit does. A re-render with a different address must
    // not re-arm the poll, or the test would not see it dropped.
    if (scheduledRef.current) {
      return;
    }
    scheduledRef.current = true;
    schedulePostSubmitRefresh({
      postSubmitRefreshTimersRef,
      lockingContract: { address: lockingContractAddress, error: null },
      ...spies
    });
  }, [lockingContractAddress, spies]);

  return null;
}

describe("useWorkspacePostSubmitEffects", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls the wallet the transaction was submitted from", async () => {
    const spies = createRefreshSpies();
    render(<Harness lockingContractAddress={WALLET_A} spies={spies} />);

    await vi.advanceTimersByTimeAsync(80_000);

    expect(spies.refreshLockedContractUtxos).toHaveBeenCalledWith(WALLET_A);
  });

  it("drops the pending poll when the workspace opens another wallet", async () => {
    const spies = createRefreshSpies();
    const { rerender } = render(<Harness lockingContractAddress={WALLET_A} spies={spies} />);

    // Opening another wallet goes through history.pushState, so the workspace
    // re-renders with a new address and nothing unmounts.
    rerender(<Harness lockingContractAddress={WALLET_B} spies={spies} />);
    await vi.advanceTimersByTimeAsync(80_000);

    expect(spies.refreshLockedContractUtxos).not.toHaveBeenCalledWith(WALLET_A);
  });

  it("clears the pending poll on unmount", async () => {
    const spies = createRefreshSpies();
    const { unmount } = render(<Harness lockingContractAddress={WALLET_A} spies={spies} />);

    unmount();
    await vi.advanceTimersByTimeAsync(80_000);

    expect(spies.refreshLockedContractUtxos).not.toHaveBeenCalled();
  });
});
