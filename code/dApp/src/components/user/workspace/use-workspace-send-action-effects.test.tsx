import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useWorkspaceSendActionEffects,
  type WorkspaceSendActionEffectsCtx
} from "./use-workspace-send-action-effects";

const suggested = [{ txHash: "aa".repeat(32), outputIndex: 0 }];

function run(overrides: Partial<WorkspaceSendActionEffectsCtx>) {
  const setSttWalletInputs = vi.fn();
  renderHook(() =>
    useWorkspaceSendActionEffects({
      selectedAction: "use",
      sttExtraTransfers: [],
      sttWalletInputs: [],
      setSttWalletInputs,
      suggestedLockedInputs: suggested,
      ...overrides
    } as WorkspaceSendActionEffectsCtx)
  );
  return setSttWalletInputs;
}

describe("useWorkspaceSendActionEffects", () => {
  /**
   * A scheduled payout stages no transfers of its own, and with no pools picked
   * `lib/mesh/transactions/stt-spend.ts:28-35` funds it from the connected wallet. The
   * manual picker that used to cover this is gone, so the effect has to seed it.
   */
  it("seeds the smart wallet's pools for a scheduled payout with no staged transfers", () => {
    const setSttWalletInputs = run({ selectedAction: "payout-streaming-payment" });
    expect(setSttWalletInputs).toHaveBeenCalledWith(suggested);
  });

  it("waits for a staged transfer before seeding a guided send", () => {
    const setSttWalletInputs = run({ selectedAction: "use" });
    expect(setSttWalletInputs).not.toHaveBeenCalled();
  });

  it("leaves pools the reader already chose alone", () => {
    const setSttWalletInputs = run({
      selectedAction: "payout-streaming-payment",
      sttWalletInputs: suggested
    });
    expect(setSttWalletInputs).not.toHaveBeenCalled();
  });
});
