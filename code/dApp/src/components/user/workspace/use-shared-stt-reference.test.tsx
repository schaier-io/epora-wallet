import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, it, vi } from "vitest";

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
import { useSharedSttReference } from "./use-shared-stt-reference";

const TX_HASH = "cd".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  transactions.buildDeploySharedSttReferenceTx.mockResolvedValue({ txHex: "84a1" });
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
  expect(store.get(sharedReferenceBuildErrorAtom)).toBe(null);
  expect(store.get(sharedSttReferenceStoreErrorAtom)).not.toBe(null);
  expect(transactions.buildDeploySharedSttReferenceTx).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ lockedLovelace: "5000000" })
  );
});
