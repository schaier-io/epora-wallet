import { renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import type { TokenCapabilityMap } from "@/components/user/flow-types";
import { useWorkspaceGuidedDerivations } from "@/components/user/workspace/use-workspace-guided-derivations";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import type { DetectedSttToken } from "@/lib/mesh/detection";

const NO_CAPABILITIES: TokenCapabilityMap = {
  hasAdminPath: false,
  hasDirectAdminSigner: false,
  hasMultisigPath: false,
  hasDirectUserMatch: false,
  hasDirectAllowance: false,
  hasDirectProofOfLifeRenewalMatch: false,
  hasBeneficiaryMatch: false,
  hasStreamingPayments: false,
  hasLockedUtxos: false,
  lockedUtxosLoading: false,
  availableOperatorPaths: [],
  availableConsolidatePaths: []
};

const EMPTY_DRAFT = { ready: false, dirty: false };

function renderDerivations(
  capabilities: TokenCapabilityMap,
  advancedWalletActions: Parameters<typeof useWorkspaceGuidedDerivations>[0]["advancedWalletActions"] = [],
  selectableWizardActionKinds: Parameters<typeof useWorkspaceGuidedDerivations>[0]["selectableWizardActionKinds"] = new Set(),
  // Seeded by the caller when the case turns on route state, which the derivations read
  // through `routeStateAtom` rather than through these inputs.
  store = createStore()
) {
  return renderHook(
    () =>
      useWorkspaceGuidedDerivations({
        // Only the three drafts the status text reads; the rest of the map is not
        // reachable from the cards under test.
        actionDrafts: {
          "update-state": EMPTY_DRAFT,
          "payout-streaming-payment": EMPTY_DRAFT,
          "manage-streaming-payments": EMPTY_DRAFT
        } as never,
        activeInferredSttStateForm: createDefaultStateForm(),
        advancedWalletActions,
        selectedAction: "use",
        selectedDetectedToken: { unit: "unit-1" } as unknown as DetectedSttToken,
        selectedIntent: "send",
        selectedTokenCapabilityMap: capabilities,
        selectableWizardActionKinds,
        useAllowancePreview: { error: null, target: null, computation: null } as never,
        userFlowBranch: "existing-token",
        wizardSelectedAction: null
      }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <Provider store={store}>{children}</Provider>
      )
    }
  );
}

function scheduledPaymentsCard(capabilities: TokenCapabilityMap) {
  const { result } = renderDerivations(capabilities);
  return (
    result.current.guidedEverydayActions.find(
      (card) => card.title === "Scheduled payments"
    ) ?? null
  );
}

/**
 * The card renders for two different readers. `canManageStreamingPayments` follows the
 * operator paths the connected key holds, but `canPayStreamingPayments` follows only
 * whether the wallet HAS schedules, which is true for a payee who holds no operator
 * path at all. Routing that reader at `manage-streaming-payments` sent them to an
 * action `selectableWizardActionKinds` does not contain, so the clamp guard in
 * `use-workspace-wizard-effects.ts` cleared the selection and bounced them to Home.
 */
describe("the scheduled-payments card", () => {
  it("opens the management flow for a key that holds an operator path", () => {
    const card = scheduledPaymentsCard({
      ...NO_CAPABILITIES,
      hasStreamingPayments: true,
      availableOperatorPaths: ["admin"]
    });

    expect(card).toMatchObject({
      intent: "manage-streaming-payments",
      action: "manage-streaming-payments"
    });
  });

  it("opens the payout flow for a reader who can only collect a due payment", () => {
    const card = scheduledPaymentsCard({
      ...NO_CAPABILITIES,
      hasStreamingPayments: true
    });

    expect(card).toMatchObject({
      intent: "pay-streaming-payments",
      action: "payout-streaming-payment"
    });
  });

  it("stays away when the wallet has no schedules and nobody can manage them", () => {
    expect(scheduledPaymentsCard(NO_CAPABILITIES)).toBeNull();
  });
});

/**
 * The surface renders every scheduled-payments task, so routing the payee here is only
 * half the answer. Add and Edit map to `manage-streaming-payments`, which is not
 * clamp-valid without an operator path, so clicking one cleared the selection and sent
 * the payee to Home one step after the card finally opened the right flow.
 */
describe("the scheduled-payments tabs", () => {
  function disabledTasks(capabilities: TokenCapabilityMap) {
    const { result } = renderDerivations(capabilities);
    return result.current.guidedStreamingPaymentsDisabledTasks;
  }

  it("turns off the management tabs for a reader who can only collect", () => {
    expect(
      disabledTasks({ ...NO_CAPABILITIES, hasStreamingPayments: true })
    ).toEqual(["streaming-payments-add", "streaming-payments-edit-renew"]);
  });

  it("turns off the pay tab for an operator with nothing to collect", () => {
    expect(
      disabledTasks({ ...NO_CAPABILITIES, availableOperatorPaths: ["admin"] })
    ).toEqual(["streaming-payments-pay-due"]);
  });

  it("leaves every tab on for an operator who can also collect", () => {
    expect(
      disabledTasks({
        ...NO_CAPABILITIES,
        hasStreamingPayments: true,
        availableOperatorPaths: ["admin"]
      })
    ).toEqual([]);
  });
});

describe("workspace guided tool order", () => {
  it("shows Tidy funds second, before governance actions", () => {
    const { result } = renderDerivations(
      { ...NO_CAPABILITIES, availableOperatorPaths: ["admin"] },
      ["set-intended-stake-credential", "consolidate-utxo", "wallet-vote"]
    );

    expect(result.current.guidedToolActions.map((action) => action.action)).toEqual([
      "set-intended-stake-credential",
      "consolidate-utxo",
      "wallet-withdraw",
      "wallet-publish",
      "wallet-vote"
    ]);
  });
});


/**
 * A cold load of `?view=activity` carries no activity context: the activity query is gated on
 * a connected wallet with a resolved address, so at first paint nothing is in flight and no
 * event is counted, and a wallet with an empty history never gains one. The section used to
 * fall back to "home" in that state, so the deep link opened Wallet home while the document
 * title, read from the same URL, said "Activity".
 */
describe("a deep link to the activity section", () => {
  it("keeps the section the URL asked for when no activity context has arrived", () => {
    const store = createStore();
    store.set(
      routeStateAtom,
      parseWorkspaceRouteState(new URLSearchParams("wallet=unit&step=overview&view=activity"))
    );

    const { result } = renderDerivations(NO_CAPABILITIES, [], new Set(), store);

    expect(result.current.hasGuidedActivityContext).toBe(false);
    expect(result.current.resolvedGuidedOverviewSection).toBe("transactions");
    expect(result.current.isGuidedTransactionsSelected).toBe(true);
  });
});

describe("normal beneficiary recovery entry", () => {
  it("starts with withdrawal and keeps exact distribution off the everyday cards", () => {
    const { result } = renderDerivations(
      { ...NO_CAPABILITIES, hasBeneficiaryMatch: true },
      [],
      new Set(["use-beneficiary", "distribute-beneficiaries"])
    );

    expect(result.current.guidedEverydayActions.find((card) => card.intent === "send"))
      .toMatchObject({ action: "use-beneficiary" });
    expect(result.current.guidedEverydayActions.some((card) => card.action === "distribute-beneficiaries"))
      .toBe(false);
  });
});

/**
 * Each card is a door, so it has to carry the name written on the other side of it. These
 * three did not: "Turn on staking" opened a screen headed "Enable staking", "Governance"
 * opened "Publish certificate", and "Receive funds" opened "Add funds". The titles are
 * built here, and the sidebar view's own test hardcodes them in a fixture, so nothing
 * checked the real derivation.
 */
describe("what the tool cards are called", () => {
  it("names each card after the screen it opens", () => {
    const { result } = renderDerivations(
      { ...NO_CAPABILITIES, availableOperatorPaths: ["admin"] },
      ["set-intended-stake-credential", "consolidate-utxo", "wallet-vote"]
    );

    const titleByAction = new Map(
      result.current.guidedToolActions.map((action) => [action.action, action.title])
    );

    expect(titleByAction.get("set-intended-stake-credential")).toBe("Enable staking");
    expect(titleByAction.get("wallet-withdraw")).toBe("Claim rewards");
    expect(titleByAction.get("wallet-publish")).toBe("Publish certificate");
  });
});

/**
 * The Edit tab on a wallet with no payments is a dead end ("Nothing to change. Add a
 * payment on the other tab first."), which is the whole reason the card carries a `task`.
 */
describe("which tab the scheduled-payments card opens", () => {
  it("sends an empty schedule to Add and an existing one to Edit", () => {
    expect(
      scheduledPaymentsCard({
        ...NO_CAPABILITIES,
        availableOperatorPaths: ["admin"]
      })?.task
    ).toBe("streaming-payments-add");

    expect(
      scheduledPaymentsCard({
        ...NO_CAPABILITIES,
        hasStreamingPayments: true,
        availableOperatorPaths: ["admin"]
      })?.task
    ).toBe("streaming-payments-edit-renew");
  });
});
