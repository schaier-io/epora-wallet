"use client";

import {
  type AuthorityPath,
  type ConsolidateAuthorityPath,
  type OperatorAuthorityPath
} from "@/lib/types/contracts";
import { type SttSpendActionMode } from "@/components/user/workspace/types";
import { type TokenCapabilityMap, type UserActionKind } from "@/components/user/flow-types";
import { getSttAuthorityOptions } from "@/components/user/workspace/helpers";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceSttOptionDerivations.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceSttOptionDerivations", defaultMessages);

/**
 * The authority-path options available for the current STT-spend action, narrowed to the
 * paths the selected token actually supports (operator paths for spend/update/manage, the
 * consolidate paths for tidy-utxos). Pure, and extracted from the controller's `useMemo` so it
 * is unit-testable; the controller keeps the memo wrapper + dependency array.
 */
export function computeSttAuthorityOptions(
  effectiveSttAction: SttSpendActionMode,
  selectedTokenCapabilityMap: TokenCapabilityMap | null
): ReturnType<typeof getSttAuthorityOptions> {
  const baseOptions = getSttAuthorityOptions(effectiveSttAction);

  if (!selectedTokenCapabilityMap) {
    return baseOptions;
  }

  if (
    effectiveSttAction === "use" ||
    effectiveSttAction === "update-state" ||
    effectiveSttAction === "manage-streaming-payments"
  ) {
    return baseOptions.filter((option) =>
      selectedTokenCapabilityMap.availableOperatorPaths.includes(
        option.value as OperatorAuthorityPath
      )
    );
  }

  if (effectiveSttAction === "consolidate-utxo") {
    return baseOptions.filter((option) =>
      selectedTokenCapabilityMap.availableConsolidatePaths.includes(
        option.value as ConsolidateAuthorityPath
      )
    );
  }

  return baseOptions;
}

/**
 * The operator-path options (Admin / Co-signers) for the wallet, taken from the selected
 * token's supported operator paths when known, otherwise the default admin/multisig pair.
 */
export function computeWalletOperatorOptions(
  selectedTokenCapabilityMap: TokenCapabilityMap | null
): Array<{ value: OperatorAuthorityPath; label: string }> {
  return selectedTokenCapabilityMap && selectedTokenCapabilityMap.availableOperatorPaths.length > 0
    ? selectedTokenCapabilityMap.availableOperatorPaths.map((path) => ({
        value: path,
        label: path === "multisig" ? i18n("coSigners") : i18n("owner")
      }))
    : [
        { value: "admin", label: i18n("owner") },
        { value: "multisig", label: i18n("coSigners") }
      ];
}

const OPERATOR_ACTIONS = new Set<UserActionKind>([
  "use",
  "update-state",
  "manage-streaming-payments",
  "wallet-withdraw",
  "wallet-publish",
  "wallet-vote",
  "set-intended-stake-credential"
]);

export type SigningActionAvailability = {
  canDirectSign: boolean;
  directAuthorityPath: AuthorityPath | null;
  canSaveApprovalRequest: boolean;
};

/**
 * Maps the connected browser wallet's roles to the actions shown in the review rail.
 * A direct owner action and a co-signer request can both be available at once.
 */
export function resolveSigningActionAvailability(
  action: UserActionKind,
  capabilityMap: TokenCapabilityMap | null
): SigningActionAvailability {
  if (!capabilityMap) {
    return {
      canDirectSign: true,
      directAuthorityPath: null,
      canSaveApprovalRequest: false
    };
  }

  if (OPERATOR_ACTIONS.has(action)) {
    const canDirectSign = capabilityMap.availableOperatorPaths.includes("admin");
    return {
      canDirectSign,
      directAuthorityPath: canDirectSign ? "admin" : null,
      canSaveApprovalRequest: capabilityMap.availableOperatorPaths.includes("multisig")
    };
  }

  if (action === "consolidate-utxo") {
    const directAuthorityPath: ConsolidateAuthorityPath | null =
      capabilityMap.availableConsolidatePaths.includes("admin")
        ? "admin"
        : capabilityMap.availableConsolidatePaths.includes("beneficiary")
          ? "beneficiary"
          : null;
    return {
      canDirectSign: directAuthorityPath !== null,
      directAuthorityPath,
      canSaveApprovalRequest: capabilityMap.availableConsolidatePaths.includes("multisig")
    };
  }

  return {
    canDirectSign: true,
    directAuthorityPath: null,
    canSaveApprovalRequest: false
  };
}
