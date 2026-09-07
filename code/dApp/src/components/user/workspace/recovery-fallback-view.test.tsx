import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { expect, it, vi } from "vitest";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { RecoveryFallbackView } from "./recovery-fallback-view";
import { WorkspaceActionsProvider } from "./workspace-actions-context";
import type { PermissionWalletWorkspaceState } from "./use-permission-wallet-workspace-state";
import { recoveryCapacityFailureAtom, recoveryCapacitySignatureAtom } from "./atoms/recovery-capacity.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { consolidateAuthorityPathAtom, sttWalletInputsAtom } from "./atoms/forms/stt-spend-form.atoms";
import { beneficiaryPreparationActiveAtom, consolidateWalletInputsAtom } from "./atoms/forms/consolidate-form.atoms";
function fixture(show: boolean) {
  const store = createStore();
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=use-beneficiary")));
  const ref = { txHash: "aa".repeat(32), outputIndex: 0 }; store.set(sttWalletInputsAtom, [ref]);
  const navigate = vi.fn(() => { store.set(consolidateAuthorityPathAtom, "admin"); store.set(beneficiaryPreparationActiveAtom, false); store.set(consolidateWalletInputsAtom, []); });
  if (show) store.set(recoveryCapacityFailureAtom, { kind: "bytes", signature: store.get(recoveryCapacitySignatureAtom) });
  render(<Provider store={store}><WorkspaceActionsProvider value={{ openWorkspaceIntent: navigate } as unknown as PermissionWalletWorkspaceState}><RecoveryFallbackView /></WorkspaceActionsProvider></Provider>);
  return { store, ref, navigate };
}
it("offers no fallback before a capacity failure", () => {
  fixture(false); expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("preparation navigation restores beneficiary authority after normal navigation resets", () => {
  const { store, ref, navigate } = fixture(true);
  fireEvent.click(screen.getByRole("button", { name: "Prepare smaller fund pools" }));
  expect(navigate).toHaveBeenCalledWith("consolidate", "consolidate-utxo");
  expect(store.get(consolidateAuthorityPathAtom)).toBe("beneficiary");
  expect(store.get(beneficiaryPreparationActiveAtom)).toBe(true);
  expect(store.get(consolidateWalletInputsAtom)).toEqual([ref]);
});
it("a changed selected input removes the fallback prompt", () => {
  const { store } = fixture(true);
  act(() => store.set(sttWalletInputsAtom, []));
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
