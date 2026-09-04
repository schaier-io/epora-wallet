import { renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import type { TokenCapabilityMap } from "@/components/user/flow-types";
import { useWorkspaceGuidedDerivations } from "@/components/user/workspace/use-workspace-guided-derivations";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import type { DetectedSttToken } from "@/lib/mesh/detection";

const NO_CAPABILITIES: TokenCapabilityMap = {
  hasAdminPath: false,
  hasDirectAdminSigner: false,
  hasMultisigPath: false,
  hasDirectUserMatch: false,
  hasDirectProofOfLifeRenewalMatch: false,
  hasBeneficiaryMatch: false,
  hasStreamingPayments: false,
  hasLockedUtxos: false,
  lockedUtxosLoading: false,
  availableOperatorPaths: [],
  availableConsolidatePaths: []
};

const EMPTY_DRAFT = { ready: false, dirty: false };

function renderDerivations(capabilities: TokenCapabilityMap) {
  const store = createStore();
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
        advancedWalletActions: [],
        selectedAction: "use",
        selectedDetectedToken: { unit: "unit-1" } as unknown as DetectedSttToken,
        selectedIntent: "send",
        selectedTokenCapabilityMap: capabilities,
        selectableWizardActionKinds: new Set(),
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
