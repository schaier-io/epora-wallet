import { USER_ACTION_DEFINITIONS } from "@/lib/user-flow/action-definitions";
import { type UserActionKind, type UserWorkspaceTask } from "@/components/user/flow-types";
import { type SttSpendActionMode } from "@/components/user/workspace/types";
import { buildStateActionData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { type AuthorityPath, type ConsolidateAuthorityPath, type OperatorAuthorityPath, type WalletInputRef } from "@/lib/types/contracts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersActionPaths.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceHelpersActionPaths", defaultMessages);

export function isWalletSettingsTask(task: UserWorkspaceTask | null) {
  return Boolean(task?.startsWith("settings-"));
}

export function isStreamingPaymentTask(task: UserWorkspaceTask | null) {
  return Boolean(task?.startsWith("streaming-payments-"));
}

export function resolveUseActionAlternative(authorityPath: AuthorityPath) {
  return buildStateActionData(resolveStructuredOnChainAction("use", authorityPath));
}

export function resolveUpdateStateActionAlternative(authorityPath: AuthorityPath) {
  return buildStateActionData(
    resolveStructuredOnChainAction("update-state", authorityPath)
  );
}

export function resolveManageStreamingPaymentsActionAlternative(authorityPath: AuthorityPath) {
  return buildStateActionData(
    resolveStructuredOnChainAction("manage-streaming-payments", authorityPath)
  );
}

export function resolveOperatorActionAlternative(authorityPath: OperatorAuthorityPath) {
  return buildStateActionData(resolveStructuredOnChainAction("use", authorityPath));
}

export function resolveConsolidateActionAlternative(authorityPath: ConsolidateAuthorityPath) {
  return buildStateActionData(
    resolveStructuredOnChainAction("consolidate-utxo", authorityPath)
  );
}

export function isSttFlowAction(value: UserActionKind): value is SttSpendActionMode {
  return (
    value === "use" ||
    value === "renew-proof-of-life" ||
    value === "update-state" ||
    value === "manage-streaming-payments" ||
    value === "use-allowance" ||
    value === "use-beneficiary" ||
    value === "payout-streaming-payment" ||
    value === "consolidate-utxo"
  );
}

/** Administrative actions do not select or consume existing wallet fund pools. */
export function supportsSttFundPoolInputs(action: SttSpendActionMode): boolean {
  return (
    action !== "renew-proof-of-life" &&
    action !== "update-state" &&
    action !== "manage-streaming-payments"
  );
}

export function resolveSttFundPoolInputs(
  action: SttSpendActionMode,
  inputs: WalletInputRef[]
): WalletInputRef[] {
  return supportsSttFundPoolInputs(action) ? inputs : [];
}

export function isUserActionKind(value: string): value is UserActionKind {
  return USER_ACTION_DEFINITIONS.some((definition) => definition.kind === value);
}

export function getSttAuthorityOptions(
  action: SttSpendActionMode
): Array<{ value: AuthorityPath; label: string }> {
  if (action === "use" || action === "update-state" || action === "manage-streaming-payments") {
    return [
      { value: "admin", label: i18n("owner") },
      { value: "multisig", label: i18n("coSigners") }
    ];
  }

  if (action === "renew-proof-of-life") {
    return [{ value: "rule-driven", label: i18n("allowedPerson") }];
  }

  if (action === "consolidate-utxo") {
    return [
      { value: "admin", label: i18n("owner") },
      { value: "multisig", label: i18n("coSigners") },
      { value: "beneficiary", label: i18n("recoveryContact") }
    ];
  }

  if (action === "use-beneficiary") {
    return [{ value: "beneficiary", label: i18n("recoveryContact") }];
  }

  if (action === "use-allowance") {
    return [{ value: "user", label: i18n("spender") }];
  }

  return [{ value: "rule-driven", label: i18n("schedule") }];
}

/** When manual hash/index are empty, use the selected detected STT UTxO (wrapper flows). */

export function resolveWalletWrapperSttInputRef(
  selectedToken: { utxo: { input: { txHash: string; outputIndex: number } } } | null,
  manualHash: string,
  manualIndex: string
): { txHash: string; indexStr: string } {
  const trimmedHash = manualHash.trim();
  const trimmedIndex = manualIndex.trim();
  if (trimmedHash) {
    return { txHash: trimmedHash, indexStr: trimmedIndex };
  }
  if (selectedToken) {
    return {
      txHash: selectedToken.utxo.input.txHash,
      indexStr: trimmedIndex || String(selectedToken.utxo.input.outputIndex)
    };
  }
  return { txHash: "", indexStr: trimmedIndex };
}

/**
 * Render-level mirror of the sidebar's gating. The URL parser only checks that an
 * `?action=` value names a real action, so a hand-built link can name an advanced
 * action (publish, vote, staking credential, ...) the connected key cannot perform.
 * The sidebar builds its lists from the same selectable-kinds set, so when the
 * capability map has resolved and the action is not in it, the form must not render
 * either. `mint` is the create-wallet mode and has no capability row; with no map
 * (token not resolved yet) nothing is blocked, matching the pre-detection state.
 */
export function isActionBlockedByCapabilities(
  action: UserActionKind,
  selectableKinds: ReadonlySet<UserActionKind>,
  hasCapabilityMap: boolean
): boolean {
  return hasCapabilityMap && action !== "mint" && !selectableKinds.has(action);
}
