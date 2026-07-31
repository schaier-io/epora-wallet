import { act, renderHook, waitFor } from "@testing-library/react";
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

    const { result } = renderHook(() => useProposals(true));

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
    });

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
    });
  });
});
