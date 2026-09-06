import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore, type WritableAtom } from "jotai";
import type { PropsWithChildren } from "react";
import { expect, it, vi, beforeEach } from "vitest";
import { DEFAULT_PROTOCOL_PARAMETERS, type Protocol } from "@meshsdk/common";
import { useBeneficiaryPreparation } from "./use-beneficiary-preparation";
import { beneficiaryPreparationActiveAtom, beneficiaryPreparationPoolAssetsAtom } from "./atoms/forms/consolidate-form.atoms";
import { beneficiaryPreparationProtocolAtom } from "./atoms/beneficiary-preparation.atoms";
import { lockingContractAtom } from "./atoms/workspace-wallet-derivations.atoms";
import { WorkspaceActionsProvider } from "./workspace-actions-context";
import type { PermissionWalletWorkspaceState } from "./use-permission-wallet-workspace-state";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), derive: vi.fn() }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { fetchProtocolParameters() { return mocks.fetch() as Promise<Protocol>; } } }));
vi.mock("./beneficiary-preparation-model", () => ({ deriveBeneficiaryPreparationPreview: mocks.derive }));
vi.mock("./atoms/workspace-wallet-derivations.atoms", async () => {
  const { atom } = await import("jotai");
  const { createDefaultStateForm } = await import("@/lib/contracts/state-form");
  return { lockingContractAtom: atom({ address: "wallet-a" }), activeInferredSttStateFormAtom: atom(createDefaultStateForm()) };
});
beforeEach(() => {
  mocks.fetch.mockReset(); mocks.derive.mockReset().mockReturnValue({ plan: null, selectedAmount: [], error: null });
});
function fixture() {
  const store = createStore(); store.set(beneficiaryPreparationActiveAtom, true);
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}><WorkspaceActionsProvider value={{ refreshLockedContractUtxos: vi.fn(), openWorkspaceIntent: vi.fn() } as unknown as PermissionWalletWorkspaceState}>{children}</WorkspaceActionsProvider></Provider>;
  return { store, ...renderHook(useBeneficiaryPreparation, { wrapper }) };
}
it("ignores an old protocol response after the wallet changes", async () => {
  let first!: (value: Protocol) => void; let second!: (value: Protocol) => void;
  mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
  const { store } = fixture();
  // The mocked atom is writable; the production address is derived from wallet State.
  const writable = lockingContractAtom as unknown as WritableAtom<{ address: string }, [{ address: string }], void>;
  act(() => store.set(writable, { address: "wallet-b" }));
  await act(async () => first(DEFAULT_PROTOCOL_PARAMETERS));
  expect(store.get(beneficiaryPreparationProtocolAtom)).toBeNull();
  await act(async () => second(DEFAULT_PROTOCOL_PARAMETERS));
  expect(store.get(beneficiaryPreparationProtocolAtom)?.address).toBe("wallet-b");
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
it("applies the planner's valid ADA correction without changing native quantities", async () => {
  mocks.fetch.mockResolvedValue(DEFAULT_PROTOCOL_PARAMETERS);
  mocks.derive.mockReturnValue({ plan: { suggestedPoolLovelace: 6000000n }, selectedAmount: [], error: null });
  const { store, result } = fixture();
  await waitFor(() => expect(store.get(beneficiaryPreparationProtocolAtom)?.params).toBeDefined());
  store.set(beneficiaryPreparationPoolAssetsAtom, [{ unit: "lovelace", quantity: "1" }, { unit: "cc".repeat(28), quantity: "3" }]);
  act(() => result.current.correctAda());
  expect(store.get(beneficiaryPreparationPoolAssetsAtom)).toEqual([{ unit: "lovelace", quantity: "6000000" }, { unit: "cc".repeat(28), quantity: "3" }]);
});
