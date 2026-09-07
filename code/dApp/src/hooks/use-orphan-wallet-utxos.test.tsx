import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

const mocks = vi.hoisted(() => ({ fetchCredentialUtxos: vi.fn() }));

vi.mock("@/lib/contracts/blueprint", () => ({ resolveWalletSpendScriptHash: () => "hash" }));
vi.mock("@/lib/discovery/koios-client", () => ({
  fetchCredentialUtxos: mocks.fetchCredentialUtxos
}));
vi.mock("@/lib/discovery/orphan-utxos", () => ({
  findOrphanUtxos: (utxos: DiscoveredUtxo[]) => utxos,
  sumLovelace: () => 0n
}));

import { useOrphanWalletUtxos } from "./use-orphan-wallet-utxos";

type Deferred = { resolve: (value: DiscoveredUtxo[]) => void };

function deferredFetches() {
  const pending: Deferred[] = [];
  mocks.fetchCredentialUtxos.mockImplementation(
    () =>
      new Promise<DiscoveredUtxo[]>((resolve) => {
        pending.push({ resolve });
      })
  );
  return pending;
}

const utxo = (txHash: string) => ({ txHash }) as unknown as DiscoveredUtxo;

beforeEach(() => {
  mocks.fetchCredentialUtxos.mockReset();
});

it("ignores a slow response that belongs to the previously selected wallet", async () => {
  const pending = deferredFetches();
  const { result, rerender } = renderHook(
    (address: string) =>
      useOrphanWalletUtxos({ sttPolicyId: "p", sttAssetNameHex: "a", walletScriptAddress: address }),
    { initialProps: "addr_a" }
  );
  rerender("addr_b");
  expect(pending).toHaveLength(2);

  await act(async () => pending[1]!.resolve([utxo("b")]));
  await act(async () => pending[0]!.resolve([utxo("a")]));

  expect(result.current.orphans).toEqual([utxo("b")]);
  expect(result.current.loading).toBe(false);
});

it("drops the previous wallet's orphans as soon as the checked wallet changes", async () => {
  // The panel renders its orphan notice — with the consolidate button — whenever
  // the list is non-empty, so a stale list from wallet A must not survive into
  // wallet B's render while B is still being checked.
  const pending = deferredFetches();
  const { result, rerender } = renderHook(
    (address: string) =>
      useOrphanWalletUtxos({ sttPolicyId: "p", sttAssetNameHex: "a", walletScriptAddress: address }),
    { initialProps: "addr_a" }
  );
  await act(async () => pending[0]!.resolve([utxo("a")]));
  expect(result.current.orphans).toEqual([utxo("a")]);

  rerender("addr_b");

  // Synchronously after the switch the stale list is gone and the check reads
  // as in-flight, not as an all-clear.
  expect(result.current.orphans).toEqual([]);
  expect(result.current.loading).toBe(true);

  await act(async () => pending[1]!.resolve([utxo("b")]));
  expect(result.current.orphans).toEqual([utxo("b")]);
});

it("clears the orphans synchronously when the wallet stops being checkable", async () => {
  const pending = deferredFetches();
  const { result, rerender } = renderHook(
    ({ address, enabled }: { address: string; enabled: boolean }) =>
      useOrphanWalletUtxos({
        sttPolicyId: "p",
        sttAssetNameHex: "a",
        walletScriptAddress: address,
        enabled
      }),
    { initialProps: { address: "addr_a", enabled: true } }
  );
  await act(async () => pending[0]!.resolve([utxo("a")]));
  expect(result.current.orphans).toEqual([utxo("a")]);

  rerender({ address: "addr_a", enabled: false });

  expect(result.current.orphans).toEqual([]);
  expect(result.current.loading).toBe(false);
});

it("shows only the latest refetch when an earlier one finishes last", async () => {
  const pending = deferredFetches();
  const { result } = renderHook(() =>
    useOrphanWalletUtxos({ sttPolicyId: "p", sttAssetNameHex: "a", walletScriptAddress: "addr" })
  );
  await act(async () => pending[0]!.resolve([]));

  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = result.current.refetch();
    second = result.current.refetch();
  });
  await act(async () => pending[2]!.resolve([utxo("second")]));
  await act(async () => pending[1]!.resolve([utxo("first")]));
  await Promise.all([first, second]);

  expect(result.current.orphans).toEqual([utxo("second")]);
});
