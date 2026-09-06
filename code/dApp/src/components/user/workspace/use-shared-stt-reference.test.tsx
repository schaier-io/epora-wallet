import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ saveSttReference: vi.fn() }));
vi.mock("@/lib/mesh/stt-reference-storage", () => storage);

const chain = vi.hoisted(() => ({ detectSharedSttReferenceStore: vi.fn() }));
const transactions = vi.hoisted(() => ({
  buildDeploySharedSttReferenceTx: vi.fn(),
  signAndSubmitTx: vi.fn()
}));

vi.mock("@/lib/mesh/detection", () => ({
  detectSharedSttReferenceStore: chain.detectSharedSttReferenceStore
}));
vi.mock("@/lib/mesh/transactions", () => ({
  buildDeploySharedSttReferenceTx: transactions.buildDeploySharedSttReferenceTx,
  DEFAULT_SHARED_STT_REFERENCE_LOVELACE: "5000000",
  signAndSubmitTx: transactions.signAndSubmitTx
}));

import {
  sharedReferenceBuildErrorAtom,
  sharedReferenceSubmitHashAtom,
  sharedSttReferenceStoreErrorAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";
import { configAtom } from "./atoms/workspace-config.atoms";
import { useSharedSttReference } from "./use-shared-stt-reference";

const TX_HASH = "cd".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  transactions.buildDeploySharedSttReferenceTx.mockResolvedValue({ txHex: "84a1", referenceScriptOutputIndex: 3 });
  transactions.signAndSubmitTx.mockResolvedValue(TX_HASH);
});

it("keeps a successful setup submit when its follow-up read fails", async () => {
  const store = createStore();
  const readError = new Error("Indexer unavailable");
  chain.detectSharedSttReferenceStore.mockRejectedValue(readError);
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(
    () => useSharedSttReference({ activeWallet: {} as never, enabled: false, isDemoWallet: false }),
    { wrapper }
  );

  await act(async () => {
    await result.current.createInlineSharedReference();
  });

  expect(store.get(sharedReferenceSubmitHashAtom)).toBe(TX_HASH);
  expect(store.get(configAtom).sttSpendReference).toBe(`${TX_HASH}#3`);
  expect(storage.saveSttReference).toHaveBeenCalledWith(`${TX_HASH}#3`);
  expect(store.get(sharedReferenceBuildErrorAtom)).toBe(null);
  expect(store.get(sharedSttReferenceStoreErrorAtom)).not.toBe(null);
  expect(transactions.buildDeploySharedSttReferenceTx).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ lockedLovelace: "5000000" })
  );
});


it("keeps the successful submit and session reference if persistence is unavailable", async () => {
  const store = createStore();
  storage.saveSttReference.mockImplementationOnce(() => { throw new Error("Storage unavailable"); });
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(
    () => useSharedSttReference({ activeWallet: {} as never, enabled: false, isDemoWallet: false }),
    { wrapper }
  );
  await act(async () => { await result.current.createInlineSharedReference(); });
  expect(store.get(sharedReferenceSubmitHashAtom)).toBe(TX_HASH);
  expect(store.get(configAtom).sttSpendReference).toBe(`${TX_HASH}#3`);
  expect(store.get(sharedSttReferenceStoreErrorAtom)).toBe("Could not check the one-time setup.");
});


it("checks an existing configured reference before offering deployment", async () => {
  const store = createStore();
  const reference = `${TX_HASH}#4`;
  store.set(configAtom, { ...store.get(configAtom), sttSpendReference: reference });
  chain.detectSharedSttReferenceStore.mockResolvedValue({ status: "ready", activeReference: reference });
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  renderHook(() => useSharedSttReference({ activeWallet: {} as never, enabled: true, isDemoWallet: false }), { wrapper });
  await waitFor(() => expect(chain.detectSharedSttReferenceStore).toHaveBeenCalledWith(reference));
  expect(transactions.buildDeploySharedSttReferenceTx).not.toHaveBeenCalled();
});

it("explicit replacement bypasses the unavailable saved reference and checks the new one", async () => {
  const store = createStore();
  store.set(configAtom, { ...store.get(configAtom), sttSpendReference: `${TX_HASH}#99` });
  chain.detectSharedSttReferenceStore.mockRejectedValue(new Error("Old reference spent"));
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useSharedSttReference({ activeWallet: {} as never, enabled: false, isDemoWallet: false }), { wrapper });
  await act(async () => { await result.current.createInlineSharedReference(true); });
  expect(transactions.buildDeploySharedSttReferenceTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    sttSpendReference: "", allowDuplicateCurrentScriptReferences: true
  }));
  expect(chain.detectSharedSttReferenceStore).toHaveBeenCalledWith(`${TX_HASH}#3`);
  expect(store.get(configAtom).sttSpendReference).toBe(`${TX_HASH}#3`);
});
