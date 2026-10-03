import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useWorkspaceSendActionEffects,
  type WorkspaceSendActionEffectsCtx
} from "./use-workspace-send-action-effects";

const suggested = [{ txHash: "aa".repeat(32), outputIndex: 0 }];

function run(overrides: Partial<WorkspaceSendActionEffectsCtx>) {
  const setSttWalletInputs = vi.fn();
  const refreshLockedContractUtxos = vi.fn(() => Promise.resolve(true));
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
      selectedLockedContractAssets: [],
      requestedLockedAssetTotals: [],
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

  // A second, larger payout must not keep the smaller first pick: the builder would
  // refuse the draft ("no longer cover") instead of drawing from the chosen pools.
  it("re-seeds when the chosen pools no longer cover the staged payouts", () => {
    const { setSttWalletInputs } = run({
      selectedAction: "use",
      sttExtraTransfers: [{} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number]],
      sttWalletInputs: [{ txHash: "bb".repeat(32), outputIndex: 0 }],
      selectedLockedContractAssets: [{ unit: "lovelace", quantity: "10000000" }],
      requestedLockedAssetTotals: [{ unit: "lovelace", quantity: "60000000" }]
    });
    expect(setSttWalletInputs).toHaveBeenCalledWith(suggested);
  });

  it("keeps a chosen pick that still covers the staged payouts", () => {
    const { setSttWalletInputs } = run({
      selectedAction: "use",
      sttExtraTransfers: [{} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number]],
      sttWalletInputs: [{ txHash: "bb".repeat(32), outputIndex: 0 }],
      selectedLockedContractAssets: [{ unit: "lovelace", quantity: "60000000" }],
      requestedLockedAssetTotals: [{ unit: "lovelace", quantity: "60000000" }]
    });
    expect(setSttWalletInputs).not.toHaveBeenCalled();
  });

  // Unchecking one pool to swap it for another briefly leaves the pick short. The
  // staged payouts did not change, so the reader's edit must not snap back.
  it("lets the reader edit a pick while the staged payouts stay the same", () => {
    const setSttWalletInputs = vi.fn();
    const transfer = {} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number];
    const requested = [{ unit: "lovelace", quantity: "60000000" }];
    const base = {
      lockingContractAddress: "wallet-a",
      refreshLockedContractUtxos: vi.fn(() => Promise.resolve()),
      selectedAction: "use",
      wizardSelectedAction: "use",
      sttExtraTransfers: [transfer],
      setSttWalletInputs,
      suggestedLockedInputs: suggested,
      requestedLockedAssetTotals: requested
    };
    const { rerender } = renderHook((ctx: WorkspaceSendActionEffectsCtx) => useWorkspaceSendActionEffects(ctx), {
      initialProps: {
        ...base,
        sttWalletInputs: suggested,
        selectedLockedContractAssets: requested
      } as WorkspaceSendActionEffectsCtx
    });
    rerender({
      ...base,
      sttWalletInputs: [{ txHash: "bb".repeat(32), outputIndex: 0 }],
      selectedLockedContractAssets: [{ unit: "lovelace", quantity: "10000000" }]
    } as WorkspaceSendActionEffectsCtx);
    expect(setSttWalletInputs).not.toHaveBeenCalled();

    rerender({
      ...base,
      requestedLockedAssetTotals: [{ unit: "lovelace", quantity: "70000000" }],
      sttWalletInputs: [{ txHash: "bb".repeat(32), outputIndex: 0 }],
      selectedLockedContractAssets: [{ unit: "lovelace", quantity: "10000000" }]
    } as WorkspaceSendActionEffectsCtx);
    expect(setSttWalletInputs).toHaveBeenCalledWith(suggested);
  });

  // A larger payout staged while funds reload finds no suggestion yet. The check
  // must wait for the suggestion instead of being used up by that empty run.
  it("re-seeds once a suggestion arrives for a payout staged during a reload", () => {
    const setSttWalletInputs = vi.fn();
    const stalePick = [{ txHash: "bb".repeat(32), outputIndex: 0 }];
    const base = {
      lockingContractAddress: "wallet-a",
      refreshLockedContractUtxos: vi.fn(() => Promise.resolve()),
      selectedAction: "use",
      wizardSelectedAction: "use",
      sttExtraTransfers: [{} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number]],
      setSttWalletInputs,
      sttWalletInputs: stalePick,
      selectedLockedContractAssets: [{ unit: "lovelace", quantity: "10000000" }]
    };
    const { rerender } = renderHook((ctx: WorkspaceSendActionEffectsCtx) => useWorkspaceSendActionEffects(ctx), {
      initialProps: {
        ...base,
        suggestedLockedInputs: suggested,
        requestedLockedAssetTotals: [{ unit: "lovelace", quantity: "10000000" }]
      } as WorkspaceSendActionEffectsCtx
    });
    rerender({
      ...base,
      suggestedLockedInputs: [],
      requestedLockedAssetTotals: [{ unit: "lovelace", quantity: "60000000" }]
    } as WorkspaceSendActionEffectsCtx);
    rerender({
      ...base,
      suggestedLockedInputs: suggested,
      requestedLockedAssetTotals: [{ unit: "lovelace", quantity: "60000000" }]
    } as WorkspaceSendActionEffectsCtx);
    expect(setSttWalletInputs).toHaveBeenCalledWith(suggested);
  });

  // The reader's edit is newer than a request change that arrived during a reload.
  it("keeps a reader edit made after a request change that waited for a suggestion", () => {
    const setSttWalletInputs = vi.fn();
    const requested = [{ unit: "lovelace", quantity: "60000000" }];
    const base = {
      lockingContractAddress: "wallet-a",
      refreshLockedContractUtxos: vi.fn(() => Promise.resolve()),
      selectedAction: "use",
      wizardSelectedAction: "use",
      sttExtraTransfers: [{} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number]],
      setSttWalletInputs
    };
    const { rerender } = renderHook((ctx: WorkspaceSendActionEffectsCtx) => useWorkspaceSendActionEffects(ctx), {
      initialProps: {
        ...base,
        suggestedLockedInputs: [],
        sttWalletInputs: suggested,
        selectedLockedContractAssets: requested,
        requestedLockedAssetTotals: requested
      } as WorkspaceSendActionEffectsCtx
    });
    const edited = {
      ...base,
      sttWalletInputs: [{ txHash: "bb".repeat(32), outputIndex: 0 }],
      selectedLockedContractAssets: [{ unit: "lovelace", quantity: "10000000" }],
      requestedLockedAssetTotals: requested
    };
    rerender({ ...edited, suggestedLockedInputs: [] } as WorkspaceSendActionEffectsCtx);
    rerender({ ...edited, suggestedLockedInputs: suggested } as WorkspaceSendActionEffectsCtx);
    expect(setSttWalletInputs).not.toHaveBeenCalled();
  });

  // A refresh that drops a picked UTxO shortens the pick without any reader edit.
  it("re-seeds when a refresh leaves the same pick short", () => {
    const setSttWalletInputs = vi.fn();
    const pick = [{ txHash: "bb".repeat(32), outputIndex: 0 }];
    const requested = [{ unit: "lovelace", quantity: "60000000" }];
    const base = {
      lockingContractAddress: "wallet-a",
      refreshLockedContractUtxos: vi.fn(() => Promise.resolve()),
      selectedAction: "use",
      wizardSelectedAction: "use",
      sttExtraTransfers: [{} as WorkspaceSendActionEffectsCtx["sttExtraTransfers"][number]],
      setSttWalletInputs,
      suggestedLockedInputs: suggested,
      sttWalletInputs: pick,
      requestedLockedAssetTotals: requested
    };
    const { rerender } = renderHook((ctx: WorkspaceSendActionEffectsCtx) => useWorkspaceSendActionEffects(ctx), {
      initialProps: { ...base, selectedLockedContractAssets: requested } as WorkspaceSendActionEffectsCtx
    });
    rerender({ ...base, selectedLockedContractAssets: [] } as WorkspaceSendActionEffectsCtx);
    expect(setSttWalletInputs).toHaveBeenCalledWith(suggested);
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
    const refreshLockedContractUtxos = vi.fn(() => Promise.resolve(true));
    const base = {
      lockingContractAddress: "wallet-a",
      refreshLockedContractUtxos,
      selectedAction: "use" as const,
      sttExtraTransfers: [],
      sttWalletInputs: [],
      setSttWalletInputs: vi.fn(),
      suggestedLockedInputs: suggested,
      selectedLockedContractAssets: [],
      requestedLockedAssetTotals: []
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
