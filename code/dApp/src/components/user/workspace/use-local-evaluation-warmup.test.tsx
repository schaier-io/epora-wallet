import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { retainLocalEvaluationWorker, warmLocalEvaluationWorker } from "@/lib/mesh/transactions/internals/local-evaluation-worker";
import { useLocalEvaluationWarmup } from "./use-local-evaluation-warmup";

vi.mock("@/lib/mesh/transactions/internals/local-evaluation-worker", () => ({ warmLocalEvaluationWorker: vi.fn(), retainLocalEvaluationWorker: vi.fn() }));
const ready = { walletReady: true, selectedWalletUnit: "wallet-a", isRouteStateCurrent: true, editorActive: true, creatingWallet: false };
beforeEach(() => {
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  vi.mocked(warmLocalEvaluationWorker).mockReset().mockResolvedValue(undefined);
  vi.mocked(retainLocalEvaluationWorker).mockReset().mockImplementation(() => vi.fn());
});
afterEach(() => cleanup());

describe("wallet selection evaluation warmup", () => {
  it("warms once for a ready selection and aborts on unmount", () => {
    const { rerender, unmount } = renderHook(props => useLocalEvaluationWarmup(props), { initialProps: ready });
    const signal = vi.mocked(warmLocalEvaluationWorker).mock.calls[0]![0]!;
    rerender({ ...ready });
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
    expect(vi.mocked(retainLocalEvaluationWorker).mock.results[0]!.value).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...ready, walletReady: false },
    { ...ready, selectedWalletUnit: "" },
    { ...ready, isRouteStateCurrent: false },
    { ...ready, editorActive: false }
  ])("skips selection when readiness is missing: %j", props => {
    renderHook(() => useLocalEvaluationWarmup(props));
    expect(warmLocalEvaluationWorker).not.toHaveBeenCalled();
  });

  it("cancels old selection and starts the next selection", () => {
    const { rerender } = renderHook(props => useLocalEvaluationWarmup(props), { initialProps: ready });
    const firstSignal = vi.mocked(warmLocalEvaluationWorker).mock.calls[0]![0]!;
    rerender({ ...ready, selectedWalletUnit: "wallet-b" });
    expect(firstSignal.aborted).toBe(true);
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(2);
    expect(vi.mocked(warmLocalEvaluationWorker).mock.calls[1]![0]!.aborted).toBe(false);
  });

  it("warms wallet creation before a wallet unit exists", () => {
    renderHook(() => useLocalEvaluationWarmup({ ...ready, selectedWalletUnit: "", creatingWallet: true }));
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(1);
    expect(retainLocalEvaluationWorker).toHaveBeenCalledTimes(1);
  });

  it("releases a hidden editor and warms again when visible", () => {
    renderHook(() => useLocalEvaluationWarmup(ready));
    const firstSignal = vi.mocked(warmLocalEvaluationWorker).mock.calls[0]![0]!;
    const release = vi.mocked(retainLocalEvaluationWorker).mock.results[0]!.value as () => void;
    act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(firstSignal.aborted).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(2);
    expect(retainLocalEvaluationWorker).toHaveBeenCalledTimes(2);
  });

  it("does not retain a hidden editor until it becomes visible", () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    renderHook(() => useLocalEvaluationWarmup(ready));
    expect(retainLocalEvaluationWorker).not.toHaveBeenCalled();
    expect(warmLocalEvaluationWorker).not.toHaveBeenCalled();
  });

  it("releases ownership after leaving the editor or disconnecting", () => {
    const hook = renderHook(props => useLocalEvaluationWarmup(props), { initialProps: ready });
    const release = vi.mocked(retainLocalEvaluationWorker).mock.results[0]!.value as () => void;
    hook.rerender({ ...ready, editorActive: false });
    expect(release).toHaveBeenCalledTimes(1);
    hook.rerender(ready);
    const nextRelease = vi.mocked(retainLocalEvaluationWorker).mock.results[1]!.value as () => void;
    hook.rerender({ ...ready, walletReady: false });
    expect(nextRelease).toHaveBeenCalledTimes(1);
  });

  it("consumes warmup failure without changing the view", async () => {
    vi.mocked(warmLocalEvaluationWorker).mockRejectedValue(new Error("worker unavailable"));
    renderHook(() => useLocalEvaluationWarmup(ready));
    await Promise.resolve();
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(1);
  });

  it("warms again on review entry without warming on review exit", () => {
    const { rerender } = renderHook(props => useLocalEvaluationWarmup(props), {
      initialProps: { ...ready, flowStep: "configure" as "configure" | "review" }
    });
    rerender({ ...ready, flowStep: "review" });
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(2);
    rerender({ ...ready, flowStep: "review" });
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(2);
    rerender({ ...ready, flowStep: "configure" });
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(2);
    rerender({ ...ready, flowStep: "review" });
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(3);
  });

  it("keeps one worker owner on review entry and cancels both warmups when hidden", () => {
    const { rerender } = renderHook(props => useLocalEvaluationWarmup(props), {
      initialProps: { ...ready, flowStep: "configure" as "configure" | "review" }
    });
    rerender({ ...ready, flowStep: "review" });
    expect(retainLocalEvaluationWorker).toHaveBeenCalledTimes(1);
    const release = vi.mocked(retainLocalEvaluationWorker).mock.results[0]!.value as () => void;
    expect(release).not.toHaveBeenCalled();
    const signals = vi.mocked(warmLocalEvaluationWorker).mock.calls.map(call => call[0]!);
    expect(signals).toHaveLength(2);
    act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("warms once for a selection opened directly in review", () => {
    renderHook(() => useLocalEvaluationWarmup({ ...ready, flowStep: "review" }));
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(1);
  });

  it("restarts aborted mount warmup during Strict Mode effect replay", () => {
    renderHook(() => useLocalEvaluationWarmup(ready), { wrapper: StrictMode });
    const signals = vi.mocked(warmLocalEvaluationWorker).mock.calls.map(call => call[0]!);
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it("warms again when the current route becomes ready", () => {
    const { rerender } = renderHook(props => useLocalEvaluationWarmup(props), { initialProps: ready });
    rerender({ ...ready, isRouteStateCurrent: false });
    rerender(ready);
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(2);
  });

  it("cancels warmup when the wallet session changes", () => {
    const { rerender } = renderHook(props => useLocalEvaluationWarmup(props), {
      initialProps: { ...ready, session: {} }
    });
    const signal = vi.mocked(warmLocalEvaluationWorker).mock.calls[0]![0]!;
    rerender({ ...ready, session: {} });
    expect(signal.aborted).toBe(true);
    expect(warmLocalEvaluationWorker).toHaveBeenCalledTimes(2);
  });
});
