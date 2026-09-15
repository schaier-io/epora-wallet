import { act, renderHook } from "@testing-library/react";
import { Provider, createStore, type ExtractAtomValue, type PrimitiveAtom } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorityPath, BuildResult } from "@/lib/types/contracts";
import {
  activeBuildAtom, activeSubmitAtom, buildRunAtom, previewSignatureAtom,
  submitHashAtom, workspaceSessionAtom
} from "./atoms/transaction-flow.atoms";
import {
  PREPARED_TRANSACTION_MAX_AGE_MS, preparedWorkspaceTransactionAtom,
  workspaceTransactionSnapshotAtom
} from "./workspace-prepared-transaction";
import { TRANSACTION_PREBUILD_DEBOUNCE_MS, useWorkspaceTransactionPrebuild } from "./use-workspace-transaction-prebuild";

vi.mock("./atoms/transaction-flow.atoms", async () => {
  const { atom } = await import("jotai");
  const activeBuildAtom = atom<string | null>(null);
  const buildRunAtom = atom(0);
  return {
    activeBuildAtom, buildRunAtom,
    activeSubmitAtom: atom(false),
    submitHashAtom: atom<string | null>(null),
    workspaceSessionAtom: atom({ generation: 0 }),
    previewSignatureAtom: atom<string | null>(null),
    invalidateBuildAtom: atom(null, (get, set) => {
      set(buildRunAtom, get(buildRunAtom) + 1);
      set(activeBuildAtom, null);
    })
  };
});

vi.mock("./workspace-prepared-transaction", async () => {
  const { atom } = await import("jotai");
  return {
    PREPARED_TRANSACTION_MAX_AGE_MS: 60_000,
    workspaceTransactionSnapshotAtom: atom("draft-a"),
    preparedWorkspaceTransactionAtom: atom(null)
  };
});

const transaction = { txHex: "unsigned" } as BuildResult;

function setup() {
  const store = createStore();
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const build = vi.fn<(authority?: AuthorityPath) => Promise<BuildResult | null>>().mockResolvedValue(null);
  const hook = renderHook(
    ({ enabled, authority }: { enabled: boolean; authority?: AuthorityPath }) =>
      useWorkspaceTransactionPrebuild({ enabled, authorityPathOverride: authority, buildSelectedActionTx: build }),
    { wrapper, initialProps: { enabled: true } as { enabled: boolean; authority?: AuthorityPath } }
  );
  const edit = (value: string) => act(() => {
    store.set(workspaceTransactionSnapshotAtom as PrimitiveAtom<string>, value);
  });
  return { ...hook, store, build, edit };
}

async function tick(milliseconds = TRANSACTION_PREBUILD_DEBOUNCE_MS) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

function visibility(hidden: boolean) {
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useWorkspaceTransactionPrebuild", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  it("debounces edits and only builds the final draft", async () => {
    const { build, edit } = setup();
    await tick(200);
    edit("draft-b");
    await tick(200);
    edit("draft-c");
    await tick(299);
    expect(build).not.toHaveBeenCalled();
    await tick(1);
    expect(build).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("retires an old run immediately so its completion cannot publish a preview", async () => {
    const { build, store, edit } = setup();
    let finish!: () => void;
    build.mockImplementationOnce(() => {
      const run = store.get(buildRunAtom) + 1;
      store.set(buildRunAtom, run);
      store.set(activeBuildAtom, "use");
      return new Promise(resolve => {
        finish = () => {
          // This is the shared build guard's publication contract.
          if (store.get(buildRunAtom) === run) store.set(previewSignatureAtom, "old-preview");
          resolve(transaction);
        };
      });
    });
    await tick();
    const oldRun = store.get(buildRunAtom);
    edit("draft-b");
    expect(store.get(buildRunAtom)).toBeGreaterThan(oldRun);
    expect(store.get(activeBuildAtom)).toBeNull();
    await act(async () => finish());
    expect(store.get(previewSignatureAtom)).toBeNull();
    await tick();
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("does not retry failed builds on rerender", async () => {
    const { build, rerender } = setup();
    build.mockRejectedValueOnce(new Error("build failed"));
    await tick();
    rerender({ enabled: true });
    await tick(PREPARED_TRANSACTION_MAX_AGE_MS * 2);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("cancels pending work when disabled and resumes after enabling", async () => {
    const { build, rerender } = setup();
    rerender({ enabled: false });
    await tick();
    expect(build).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await tick();
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("clears stale metadata immediately on a session change", () => {
    const { store } = setup();
    act(() => store.set(previewSignatureAtom, "old-session"));
    act(() => {
      const current = store.get(workspaceSessionAtom);
      store.set(workspaceSessionAtom as PrimitiveAtom<typeof current>, { ...current, generation: 1 });
    });
    expect(store.get(previewSignatureAtom)).toBeNull();
  });

  it("pauses hidden tabs and builds when visible again", async () => {
    const { build } = setup();
    visibility(true);
    await tick();
    expect(build).not.toHaveBeenCalled();
    visibility(false);
    await tick();
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("cancels timers on unmount", async () => {
    const { build, unmount } = setup();
    unmount();
    await tick();
    expect(build).not.toHaveBeenCalled();
  });

  it("does not retire a newer manual build on unmount", async () => {
    const { build, store, unmount } = setup();
    build.mockImplementationOnce(() => {
      store.set(buildRunAtom, 1);
      store.set(activeBuildAtom, "use");
      return new Promise(() => {});
    });
    await tick();
    act(() => store.set(buildRunAtom, 2));
    unmount();
    expect(store.get(buildRunAtom)).toBe(2);
    expect(store.get(activeBuildAtom)).toBe("use");
  });

  it.each(["hidden", "unmount"])("retires its own pending build on %s", async reason => {
    const { build, store, unmount } = setup();
    build.mockImplementationOnce(() => {
      store.set(buildRunAtom, 1);
      store.set(activeBuildAtom, "use");
      return new Promise(() => {});
    });
    await tick();
    if (reason === "hidden") visibility(true);
    else unmount();
    expect(store.get(buildRunAtom)).toBe(2);
    expect(store.get(activeBuildAtom)).toBeNull();
  });

  it("uses the latest builder without restarting the debounce", async () => {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
    const first = vi.fn().mockResolvedValue(null);
    const latest = vi.fn().mockResolvedValue(null);
    const { rerender } = renderHook(
      ({ build }) => useWorkspaceTransactionPrebuild({ enabled: true, buildSelectedActionTx: build }),
      { wrapper, initialProps: { build: first } }
    );
    await tick(200);
    rerender({ build: latest });
    await tick(100);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("does not start builds while a signature request is active", async () => {
    const { build, store } = setup();
    act(() => store.set(activeSubmitAtom, true));
    await tick();
    expect(build).not.toHaveBeenCalled();
    expect(store.get(activeSubmitAtom)).toBe(true);
  });

  it("rebuilds expired previews without signing or clearing a submission", async () => {
    const { build, store } = setup();
    await tick();
    act(() => store.set(preparedWorkspaceTransactionAtom, {
      result: transaction, builtAt: Date.now(), buildRun: store.get(buildRunAtom),
      snapshot: store.get(workspaceTransactionSnapshotAtom), session: store.get(workspaceSessionAtom), proposalCapture: null
    } as NonNullable<ExtractAtomValue<typeof preparedWorkspaceTransactionAtom>>));
    await tick(PREPARED_TRANSACTION_MAX_AGE_MS);
    expect(store.get(preparedWorkspaceTransactionAtom)).toBeNull();
    await tick();
    expect(build).toHaveBeenCalledTimes(2);
    expect(store.get(activeSubmitAtom)).toBe(false);
    act(() => store.set(submitHashAtom, "submitted"));
    await tick(PREPARED_TRANSACTION_MAX_AGE_MS);
    expect(store.get(submitHashAtom)).toBe("submitted");
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("rebuilds after a flow reset even when the draft inputs are unchanged", async () => {
    const { build, store } = setup();
    await tick();
    act(() => store.set(preparedWorkspaceTransactionAtom, {
      result: transaction, builtAt: Date.now(), buildRun: store.get(buildRunAtom),
      snapshot: store.get(workspaceTransactionSnapshotAtom), session: store.get(workspaceSessionAtom), proposalCapture: null
    }));
    act(() => {
      // resetFlowAtom and clearPreviewResult retire the run and clear the displayed signature.
      store.set(buildRunAtom, run => run + 1);
      store.set(previewSignatureAtom, null);
    });
    expect(store.get(preparedWorkspaceTransactionAtom)).toBeNull();
    await tick();
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("builds again for a changed authority after a failed attempt", async () => {
    const { build, rerender } = setup();
    await tick();
    rerender({ enabled: true, authority: "multisig" });
    await tick();
    expect(build).toHaveBeenLastCalledWith("multisig");
    expect(build).toHaveBeenCalledTimes(2);
  });
});
