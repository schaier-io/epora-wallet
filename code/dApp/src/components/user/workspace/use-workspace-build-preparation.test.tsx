import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { EMPTY_CONTRACT_CONFIG } from "@/lib/types/contracts";
import { readImmutableInputMetadata } from "@/lib/mesh/transactions/internals/immutable-input-cache";
import { useWorkspaceBuildPreparation } from "./use-workspace-build-preparation";

vi.mock("@/lib/mesh/transactions/internals/immutable-input-cache", () => ({ readImmutableInputMetadata: vi.fn() }));
const hash = "ab".repeat(32);
const otherHash = "cd".repeat(32);
const ready = {
  enabled: true,
  selectedWalletUnit: "wallet-a",
  config: { ...EMPTY_CONTRACT_CONFIG, sttSpendReference: `${hash}#0` },
  sttInput: { txHash: otherHash, outputIndex: 1 }
};

beforeEach(() => { vi.mocked(readImmutableInputMetadata).mockReset().mockResolvedValue([]); });

describe("immutable build preparation", () => {
  it("preloads configured output metadata and the selected State input", () => {
    renderHook(() => useWorkspaceBuildPreparation(ready));
    expect(readImmutableInputMetadata).toHaveBeenCalledTimes(2);
    expect(readImmutableInputMetadata).toHaveBeenCalledWith(expect.anything(), hash, 0);
    expect(readImmutableInputMetadata).toHaveBeenCalledWith(expect.anything(), otherHash, 1);
    const fetcher = vi.mocked(readImmutableInputMetadata).mock.calls[0]![0];
    expect(fetcher.signal?.aborted).toBe(false);
  });

  it("deduplicates normalized reference syntax and rejects unsafe indices", () => {
    renderHook(() => useWorkspaceBuildPreparation({ ...ready,
      config: { ...ready.config, walletSpendReference: `${hash.toUpperCase()}:0`,
        walletWithdrawReference: `${hash}#9007199254740992`, walletPublishReference: "invalid", walletVoteReference: `${otherHash}#1` }
    }));
    expect(readImmutableInputMetadata).toHaveBeenCalledTimes(2);
  });

  it.each([{ ...ready, enabled: false }, { ...ready, selectedWalletUnit: "" }])(
    "skips preparation without a ready selection", props => {
      renderHook(() => useWorkspaceBuildPreparation(props));
      expect(readImmutableInputMetadata).not.toHaveBeenCalled();
    }
  );

  it("does not repeat reads on an equivalent render", () => {
    const { rerender } = renderHook(props => useWorkspaceBuildPreparation(props), { initialProps: ready });
    rerender({ ...ready, config: { ...ready.config }, sttInput: { ...ready.sttInput } });
    expect(readImmutableInputMetadata).toHaveBeenCalledTimes(2);
  });

  it("cancels an old selection and its replacement on unmount", () => {
    const { rerender, unmount } = renderHook(props => useWorkspaceBuildPreparation(props), { initialProps: ready });
    const firstSignal = vi.mocked(readImmutableInputMetadata).mock.calls[0]![0].signal!;
    rerender({ ...ready, selectedWalletUnit: "wallet-b" });
    expect(firstSignal.aborted).toBe(true);
    expect(readImmutableInputMetadata).toHaveBeenCalledTimes(4);
    const nextSignal = vi.mocked(readImmutableInputMetadata).mock.calls[2]![0].signal!;
    expect(nextSignal.aborted).toBe(false);
    unmount();
    expect(nextSignal.aborted).toBe(true);
  });

  it("cancels stale-route preparation when disabled", () => {
    const { rerender } = renderHook(props => useWorkspaceBuildPreparation(props), { initialProps: ready });
    const signal = vi.mocked(readImmutableInputMetadata).mock.calls[0]![0].signal!;
    rerender({ ...ready, enabled: false });
    expect(signal.aborted).toBe(true);
    expect(readImmutableInputMetadata).toHaveBeenCalledTimes(2);
  });

  it("restarts when configured reference inputs change", () => {
    const { rerender } = renderHook(props => useWorkspaceBuildPreparation(props), { initialProps: ready });
    const signal = vi.mocked(readImmutableInputMetadata).mock.calls[0]![0].signal!;
    rerender({ ...ready, config: { ...ready.config, sttSpendReference: `${hash}#2` } });
    expect(signal.aborted).toBe(true);
    expect(readImmutableInputMetadata).toHaveBeenCalledWith(expect.anything(), hash, 2);
  });

  it("cancels metadata reads when the wallet session changes", () => {
    const { rerender } = renderHook(props => useWorkspaceBuildPreparation(props), {
      initialProps: { ...ready, session: {} }
    });
    const signal = vi.mocked(readImmutableInputMetadata).mock.calls[0]![0].signal!;
    rerender({ ...ready, session: {} });
    expect(signal.aborted).toBe(true);
    expect(readImmutableInputMetadata).toHaveBeenCalledTimes(4);
  });

  it("bounds a preparation to five configured references and one State input", () => {
    renderHook(() => useWorkspaceBuildPreparation({ ...ready, config: { ...ready.config,
      walletSpendReference: `${hash}#1`, walletWithdrawReference: `${hash}#2`,
      walletPublishReference: `${hash}#3`, walletVoteReference: `${hash}#4` }
    }));
    expect(readImmutableInputMetadata).toHaveBeenCalledTimes(6);
  });

  it("consumes speculative failures so the normal build can retry", async () => {
    vi.mocked(readImmutableInputMetadata).mockRejectedValue(new Error("metadata unavailable"));
    renderHook(() => useWorkspaceBuildPreparation(ready));
    await Promise.resolve();
    expect(readImmutableInputMetadata).toHaveBeenCalledTimes(2);
  });
});
