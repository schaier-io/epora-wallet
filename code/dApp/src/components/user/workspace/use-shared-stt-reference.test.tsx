import { act, renderHook, waitFor } from "@testing-library/react";
import { createQueryTestWrapper } from "@/test/query-client";
import { isConnectingAtom } from "@/providers/wallet.atoms";
import { beforeEach, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ detectSharedSttReferenceStore: vi.fn() }));
vi.mock("@/lib/mesh/detection", () => server);
vi.mock("@/lib/contracts/blueprint", () => ({ getSttMintPolicyId: () => "policy" }));

import {
  sharedSttReferenceStoreAtom,
  sharedSttReferenceStoreErrorAtom,
  sharedSttReferenceStoreLoadingAtom
} from "./atoms/workspace-data.atoms";
import { configAtom } from "./atoms/workspace-config.atoms";
import { useSharedSttReference } from "./use-shared-stt-reference";

const REFERENCE = `${"cd".repeat(32)}#3`;

beforeEach(() => {
  vi.clearAllMocks();
  server.detectSharedSttReferenceStore.mockResolvedValue({ status: "ready", activeReference: REFERENCE });
});

function setup(enabled = true) {
  const { store, wrapper } = createQueryTestWrapper();
  store.set(isConnectingAtom, enabled);
  store.set(configAtom, { ...store.get(configAtom), sttSpendReference: "old-browser-reference" });
  const hook = renderHook(() => useSharedSttReference(), { wrapper });
  return { store, ...hook };
}

it("loads the server reference without using the old browser reference", async () => {
  const { store } = setup();
  await waitFor(() => expect(store.get(sharedSttReferenceStoreLoadingAtom)).toBe(false));
  expect(server.detectSharedSttReferenceStore).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(server.detectSharedSttReferenceStore).toHaveBeenCalledTimes(1);
  expect(store.get(configAtom).sttSpendReference).toBe(REFERENCE);
});

it("does not request setup before wallet connection begins", () => {
  setup(false);
  expect(server.detectSharedSttReferenceStore).not.toHaveBeenCalled();
});

it("clears a stale reference when the server has no helper", async () => {
  server.detectSharedSttReferenceStore.mockResolvedValue({ status: "missing", activeReference: null });
  const { store } = setup();
  await waitFor(() => expect(store.get(sharedSttReferenceStoreLoadingAtom)).toBe(false));
  expect(store.get(configAtom).sttSpendReference).toBe("");
  expect(store.get(sharedSttReferenceStoreAtom)?.status).toBe("missing");
});

it("reports lookup failure and lets a read-only retry recover", async () => {
  server.detectSharedSttReferenceStore.mockRejectedValueOnce(new Error("Server unavailable"));
  const { store, result } = setup();
  await waitFor(() => expect(store.get(sharedSttReferenceStoreLoadingAtom)).toBe(false));
  expect(store.get(sharedSttReferenceStoreErrorAtom)).not.toBe(null);
  expect(store.get(configAtom).sttSpendReference).toBe("");
  await act(async () => { await result.current.refreshSharedSttReferenceStore(); });
  await waitFor(() => expect(store.get(configAtom).sttSpendReference).toBe(REFERENCE));
  expect(store.get(sharedSttReferenceStoreErrorAtom)).toBe(null);
});

it("keeps the configured reference consistent with retained ready data after a transient error", async () => {
  const { store, result } = setup();
  await waitFor(() => expect(store.get(configAtom).sttSpendReference).toBe(REFERENCE));
  server.detectSharedSttReferenceStore.mockRejectedValueOnce(new Error("temporarily unavailable"));
  await act(async () => { await expect(result.current.refreshSharedSttReferenceStore()).rejects.toThrow(); });
  await waitFor(() => expect(store.get(sharedSttReferenceStoreErrorAtom)).not.toBeNull());
  expect(store.get(sharedSttReferenceStoreAtom)?.status).toBe("ready");
  expect(store.get(configAtom).sttSpendReference).toBe(REFERENCE);
});
