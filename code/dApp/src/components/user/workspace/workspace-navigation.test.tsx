import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activeSttStateFormAtom,
  sttStateFormAtom,
  updateStateFormAtom
} from "./atoms/forms/stt-spend-form.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { useWorkspaceNavigation } from "./workspace-navigation";
import { parseWorkspaceRouteState } from "../workspace-controller";
import {
  createDefaultBeneficiaryFormState,
  createDefaultStateForm
} from "@/lib/contracts/state-form";

const dispatchWorkspaceAction = vi.hoisted(() => vi.fn());

vi.mock("@/components/user/use-workspace-controller", () => ({
  useWorkspaceRouteState: () => ({
    routeState: { selectedWalletUnit: "wallet-unit" },
    commitRouteState: vi.fn(),
    dispatch: dispatchWorkspaceAction
  })
}));

const PAYOUT_ADDRESS = "addr_test1qqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyfzyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qwzdgzn";

function navigationContext(store: ReturnType<typeof createStore>) {
  return {
    activeInferredSttStateForm: createDefaultStateForm(),
    autoMintStateForm: createDefaultStateForm(),
    clearBuildMessages: vi.fn(),
    clearPreviewResult: vi.fn(),
    flowAvailability: { canManageStreamingPayments: false, canPayStreamingPayments: false },
    jotaiStore: store,
    mintConfirmation: null,
    preview: null,
    resetActionDraft: vi.fn(),
    resetSharedReferencePreview: vi.fn(),
    reviewReceipt: { title: "", summary: "", items: [] },
    router: { push: vi.fn() },
    selectedDetectedToken: null,
    selectedTokenCapabilityMap: null,
    setSelectedDetectedTokenUnit: vi.fn(),
    setMintConfirmation: vi.fn(),
    pendingOrphanWalletInputsRef: { current: null }
  };
}

describe("update-state draft routing", () => {
  beforeEach(() => dispatchWorkspaceAction.mockClear());

  it("selects the normalized cold-route draft and restores raw State for stream management", () => {
    const store = createStore();
    const form = createDefaultStateForm();
    form.beneficiaries = [{
      ...createDefaultBeneficiaryFormState("1"),
      payoutAddress: PAYOUT_ADDRESS,
      wallets: ["aa".repeat(28), "bb".repeat(28)]
    }];
    store.set(sttStateFormAtom, form);
    store.set(
      routeStateAtom,
      parseWorkspaceRouteState(new URLSearchParams("wallet=wallet-unit&action=update-state"))
    );
    const { result } = renderHook(
      () => useWorkspaceNavigation(navigationContext(store) as never),
      { wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider> }
    );

    expect(store.get(activeSttStateFormAtom).beneficiaries[0]?.wallets).toEqual(["11".repeat(28)]);
    expect(store.get(updateStateFormAtom)).toBeNull();
    expect(store.get(sttStateFormAtom).beneficiaries[0]?.wallets).toEqual([
      "aa".repeat(28),
      "bb".repeat(28)
    ]);

    act(() => result.current.openWorkspaceIntent("manage-streaming-payments", "manage-streaming-payments"));
    store.set(
      routeStateAtom,
      parseWorkspaceRouteState(
        new URLSearchParams("wallet=wallet-unit&action=manage-streaming-payments")
      )
    );
    expect(store.get(activeSttStateFormAtom).beneficiaries[0]?.wallets).toEqual([
      "aa".repeat(28),
      "bb".repeat(28)
    ]);
  });
});
