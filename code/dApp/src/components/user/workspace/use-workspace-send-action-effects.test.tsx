import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useWorkspaceSendActionEffects,
  type WorkspaceSendActionEffectsCtx
} from "./use-workspace-send-action-effects";

const suggested = [{ txHash: "aa".repeat(32), outputIndex: 0 }];

function run(overrides: Partial<WorkspaceSendActionEffectsCtx>) {
  const setSttWalletInputs = vi.fn();
  const refreshLockedContractUtxos = vi.fn(() => Promise.resolve());
  renderHook(() =>
    useWorkspaceSendActionEffects({
      lockingContractAddress: "wallet-a",
      refreshLockedContractUtxos,
      selectedAction: "use",
      wizardSelectedAction: "use",
      sttExtraTransfers: [],
      sttWalletInputs: [],
      setSttWalletInputs,
      suggestedLockedInputs: suggested,
      ...overrides
    } as WorkspaceSendActionEffectsCtx)
  );
  return { refreshLockedContractUtxos, setSttWalletInputs };
}

describe("useWorkspaceSendActionEffects", () => {
  /**
   * The seed picks pools only for a guided send that already stages a transfer, and only
   * while nothing is selected. A scheduled payout keeps an empty selection, which the
   * builder reads as "pay from the connected wallet".
   */
  it("seeds the suggested pools once a guided send stages a transfer", () => {
    const { setSttWalletInputs } = run({
      selectedAction: "use",
      sttExtraTransfers: [{} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number]]
    });
    expect(setSttWalletInputs).toHaveBeenCalledWith(suggested);
  });

  it("waits for a staged transfer before seeding a guided send", () => {
    const { setSttWalletInputs } = run({ selectedAction: "use" });
    expect(setSttWalletInputs).not.toHaveBeenCalled();
  });

  it("leaves pools the reader already chose alone", () => {
    const { setSttWalletInputs } = run({
      selectedAction: "use",
      sttExtraTransfers: [{} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number]],
      sttWalletInputs: suggested
    });
    expect(setSttWalletInputs).not.toHaveBeenCalled();
  });

  it.each(["use", "use-allowance", "use-beneficiary"] as const)(
    "refreshes funds when %s opens",
    (selectedAction) => {
      const { refreshLockedContractUtxos } = run({ selectedAction });
      expect(refreshLockedContractUtxos).toHaveBeenCalledWith("wallet-a", { retryEmpty: true, preserveRecovery: true });
    }
  );

  it("does not refresh funds for a settings action", () => {
    const { refreshLockedContractUtxos } = run({
      selectedAction: "update-state",
      wizardSelectedAction: "update-state"
    });
    expect(refreshLockedContractUtxos).not.toHaveBeenCalled();
  });

  it("refreshes again when the default Send action closes and reopens", () => {
    const refreshLockedContractUtxos = vi.fn(() => Promise.resolve());
    const base = {
      lockingContractAddress: "wallet-a",
      refreshLockedContractUtxos,
      selectedAction: "use" as const,
      sttExtraTransfers: [],
      sttWalletInputs: [],
      setSttWalletInputs: vi.fn(),
      suggestedLockedInputs: suggested
    };
    const { rerender } = renderHook(
      ({ wizardSelectedAction }: { wizardSelectedAction: WorkspaceSendActionEffectsCtx["wizardSelectedAction"] }) =>
        useWorkspaceSendActionEffects({ ...base, wizardSelectedAction }),
      {
        initialProps: {
          wizardSelectedAction: null as WorkspaceSendActionEffectsCtx["wizardSelectedAction"]
        }
      }
    );

    expect(refreshLockedContractUtxos).not.toHaveBeenCalled();
    rerender({ wizardSelectedAction: "use" });
    expect(refreshLockedContractUtxos).toHaveBeenCalledTimes(1);
    rerender({ wizardSelectedAction: null });
    rerender({ wizardSelectedAction: "use" });
    expect(refreshLockedContractUtxos).toHaveBeenCalledTimes(2);
  });
});
