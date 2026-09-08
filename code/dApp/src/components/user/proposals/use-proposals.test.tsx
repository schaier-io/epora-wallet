import { createQueryTestWrapper } from "@/test/query-client";
import { act, renderHook as queryRenderhook, waitFor } from "@testing-library/react";
const renderHook: typeof queryRenderhook = (callback, options) => queryRenderhook(callback, { wrapper: createQueryTestWrapper().wrapper, ...options });
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalListItemDto, ProposalListPage } from "@/lib/proposals/types";

const client = vi.hoisted(() => ({ listProposals: vi.fn() }));

vi.mock("@/lib/proposals/client", () => ({
  listProposals: client.listProposals
}));

import { useProposals } from "./use-proposals";

function proposal(id: string): ProposalListItemDto {
  return {
    id,
    walletUnit: "aa01",
    walletPolicyId: "aa".repeat(28),
    title: id,
    description: null,
    actionKind: "use",
    authorityPath: "multisig",
    status: "OPEN",
    txBodyHash: "bb".repeat(32),
    submittedTxHash: null,
    createdByKeyHash: "cc".repeat(28),
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    signatureCount: 0,
    signerKeyHashes: []
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolve_) => {
    resolve = resolve_;
  });
  return { promise, resolve };
}

describe("useProposals pagination", () => {
  beforeEach(() => {
    client.listProposals.mockReset();
  });

  it("ignores a stale load-more response after refresh replaces the first page", async () => {
    const initial = deferred<ProposalListPage>();
    const staleMore = deferred<ProposalListPage>();
    const refreshed = deferred<ProposalListPage>();
    client.listProposals
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(staleMore.promise)
      .mockReturnValueOnce(refreshed.promise);

    const { result } = renderHook(() => useProposals(true, "cc".repeat(28)));

    await act(async () => {
      initial.resolve({ proposals: [proposal("old-page-1")], nextCursor: "old-cursor" });
      await initial.promise;
    });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    let loadMorePromise!: Promise<void>;
    act(() => {
      loadMorePromise = result.current.loadMore();
    });
    expect(client.listProposals).toHaveBeenLastCalledWith({
      walletUnit: undefined,
      cursor: "old-cursor"
    }, { signal: expect.any(AbortSignal) as AbortSignal });

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    await act(async () => {
      refreshed.resolve({ proposals: [proposal("fresh-page-1")], nextCursor: "fresh-cursor" });
      await refreshPromise;
    });
    await act(async () => {
      staleMore.resolve({ proposals: [proposal("stale-page-2")], nextCursor: "stale-cursor" });
      await loadMorePromise;
    });

    expect(result.current.proposals.map(({ id }) => id)).toEqual(["fresh-page-1"]);

    client.listProposals.mockResolvedValueOnce({ proposals: [], nextCursor: null });
    await act(async () => {
      await result.current.loadMore();
    });
    expect(client.listProposals).toHaveBeenLastCalledWith({
      walletUnit: undefined,
      cursor: "fresh-cursor"
    }, { signal: expect.any(AbortSignal) as AbortSignal });
  });
});


it("keeps private proposal caches separate when the signed-in key changes", async () => {
  const first = deferred<ProposalListPage>();
  client.listProposals.mockReset().mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ proposals: [proposal("signer-b")], nextCursor: null });
  const { result, rerender } = renderHook(({ signer }) => useProposals(true, signer), {
    initialProps: { signer: "a".repeat(56) }
  });
  rerender({ signer: "b".repeat(56) });
  expect(result.current.proposals).toEqual([]);
  await waitFor(() => expect(result.current.proposals[0]?.id).toBe("signer-b"));
  await act(async () => first.resolve({ proposals: [proposal("signer-a")], nextCursor: null }));
  expect(result.current.proposals.map((item) => item.id)).toEqual(["signer-b"]);
});

it("deduplicates the same signed-in proposal list across observers", async () => {
  client.listProposals.mockReset().mockResolvedValue({ proposals: [proposal("one")], nextCursor: null });
  const { result } = renderHook(() => [useProposals(true, "signer"), useProposals(true, "signer")]);
  await waitFor(() => expect(result.current.every((query) => query.proposals.length === 1)).toBe(true));
  expect(client.listProposals).toHaveBeenCalledTimes(1);
});
