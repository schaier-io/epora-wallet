import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { resetAllFormsAtom } from "../atoms/forms/reset-all-forms.atom";
import { routeStateAtom } from "../atoms/workspace-route.atoms";
import { createDefaultUserFormState, type UserFormState } from "@/lib/contracts/state-form";
import { useSpenderPermissionDraft } from "./use-spender-permission-draft";

it.each(["wallet", "signer", "reset"])("does not restore a removed limit after a %s change", (change) => {
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet-a" });
  store.set(activePaymentKeyHashAtom, "aa".repeat(28));
  const onChange = vi.fn<(value: UserFormState) => void>();
  const user = { ...createDefaultUserFormState("1"), perDayAllowance: [{ policyId: "", assetName: "", amount: "5" }] };
  const { result, rerender } = renderHook(({ person }) => useSpenderPermissionDraft(person, onChange, true), {
    initialProps: { person: user },
    wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  });
  act(() => result.current());
  const withoutLimit = onChange.mock.lastCall![0];
  rerender({ person: withoutLimit });
  act(() => {
    if (change === "wallet") store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet-b" });
    else if (change === "signer") store.set(activePaymentKeyHashAtom, "bb".repeat(28));
    else store.set(resetAllFormsAtom);
  });
  act(() => result.current());
  expect(onChange.mock.lastCall![0].perDayAllowance[0].amount).toBe("");
});
