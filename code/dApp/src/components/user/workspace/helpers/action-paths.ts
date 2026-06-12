import { USER_ACTION_DEFINITIONS } from "@/components/user/flow-config";
import { type UserActionKind, type UserWorkspaceTask } from "@/components/user/flow-types";
import { type SttSpendActionMode } from "@/components/user/workspace/types";
import { buildStateActionData, resolveStructuredOnChainAction } from "@/lib/contracts/action-data";
import { type AuthorityPath, type ConsolidateAuthorityPath, type OperatorAuthorityPath } from "@/lib/types/contracts";

export function isPeopleTask(task: UserWorkspaceTask | null) {
  return Boolean(task?.startsWith("people-"));
}

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

export function isUserActionKind(value: string): value is UserActionKind {
  return USER_ACTION_DEFINITIONS.some((definition) => definition.kind === value);
}

export function getSttAuthorityOptions(
  action: SttSpendActionMode
): Array<{ value: AuthorityPath; label: string }> {
  if (action === "use" || action === "update-state" || action === "manage-streaming-payments") {
    return [
      { value: "admin", label: "Admin" },
      { value: "multisig", label: "Co-signers" }
    ];
  }

  if (action === "renew-proof-of-life") {
    return [{ value: "rule-driven", label: "Eligible user" }];
  }

  if (action === "consolidate-utxo") {
    return [
      { value: "admin", label: "Admin" },
      { value: "multisig", label: "Co-signers" },
      { value: "beneficiary", label: "Recovery contact" }
    ];
  }

  if (action === "use-beneficiary") {
    return [{ value: "beneficiary", label: "Recovery contact" }];
  }

  if (action === "use-allowance") {
    return [{ value: "user", label: "User" }];
  }

  return [{ value: "rule-driven", label: "Rule Driven" }];
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

