import { type UserActionKind, type UserFlowStep, type UserWizardStep, type UserWorkspaceIntent } from "@/components/user/flow-types";
import { mapActionKindToIntent } from "@/components/user/workspace-controller";
import { type StateFormState } from "@/lib/contracts/state-form";

export function mapFlowStepToLegacyWizardStep(
  flowStep: UserFlowStep,
  hasWalletSelection: boolean,
  walletReady: boolean
): UserWizardStep {
  if (!walletReady) {
    return "connect";
  }

  if (flowStep === "review") {
    return "review";
  }

  if (flowStep === "configure") {
    return "configure";
  }

  return hasWalletSelection ? "action" : "source";
}

export function mapLegacyWizardStepToFlowStep(step: UserWizardStep): UserFlowStep {
  if (step === "review") {
    return "review";
  }

  if (step === "configure") {
    return "configure";
  }

  return "overview";
}

export function resolveIntentForAction(
  action: UserActionKind,
  currentIntent: UserWorkspaceIntent | null
): UserWorkspaceIntent {
  if (
    action === "update-state" &&
    (currentIntent === "manage-people" || currentIntent === "wallet-settings")
  ) {
    return currentIntent;
  }

  return mapActionKindToIntent(action);
}

export function getDetectedTokenWarningMessage(stateForm: StateFormState) {
  if (stateForm.users.length === 0 && stateForm.beneficiaries.length === 0) {
    return "No spenders or recovery contacts are set up, so only funding actions are likely to work.";
  }

  if (stateForm.users.length === 0) {
    return "This wallet has nobody on it, so no owner, approval, or allowance action can run.";
  }

  return null;
}

