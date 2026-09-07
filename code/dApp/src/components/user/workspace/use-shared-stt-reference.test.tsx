import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ detectSharedSttReferenceStore: vi.fn() }));
vi.mock("@/lib/mesh/detection", () => server);

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
  const store = createStore();
  store.set(configAtom, { ...store.get(configAtom), sttSpendReference: "old-browser-reference" });
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useSharedSttReference({ enabled }), { wrapper });
  return { store, ...hook };
}

it("loads the server reference without using the old browser reference", async () => {
  const { store } = setup();
  await waitFor(() => expect(store.get(sharedSttReferenceStoreLoadingAtom)).toBe(false));
  expect(server.detectSharedSttReferenceStore).toHaveBeenCalledWith();
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
  expect(store.get(configAtom).sttSpendReference).toBe(REFERENCE);
  expect(store.get(sharedSttReferenceStoreErrorAtom)).toBe(null);
});
