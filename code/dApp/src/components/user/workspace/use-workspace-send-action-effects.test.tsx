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
   * The seed picks pools only for a guided send that already stages a transfer, and only
   * while nothing is selected. A scheduled payout keeps an empty selection, which the
   * builder reads as "pay from the connected wallet".
   */
  it("seeds the suggested pools once a guided send stages a transfer", () => {
    const setSttWalletInputs = run({
      selectedAction: "use",
      sttExtraTransfers: [{} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number]]
    });
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
