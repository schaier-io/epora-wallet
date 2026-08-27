"use client";

import {
  type ConsolidateAuthorityPath,
  type OperatorAuthorityPath
} from "@/lib/types/contracts";
import { type SttSpendActionMode } from "@/components/user/workspace/types";
import { getSttAuthorityOptions } from "@/components/user/workspace/helpers";
import { type useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceSttOptionDerivations.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceSttOptionDerivations", defaultMessages);

type TokenCapabilityMap = ReturnType<
  typeof useWorkspaceDetectedTokenDerivations
>["selectedTokenCapabilityMap"];

/**
 * The authority-path options available for the current STT-spend action, narrowed to the
 * paths the selected token actually supports (operator paths for spend/update/manage, the
 * consolidate paths for tidy-utxos). Pure — extracted from the controller's `useMemo` so it
 * is unit-testable; the controller keeps the memo wrapper + dependency array.
 */
export function computeSttAuthorityOptions(
  effectiveSttAction: SttSpendActionMode,
  selectedTokenCapabilityMap: TokenCapabilityMap
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
 * The operator-path options (Owner / Required approvals) for the wallet, taken from the selected
 * token's supported operator paths when known, otherwise the default admin/multisig pair.
 */
export function computeWalletOperatorOptions(
  selectedTokenCapabilityMap: TokenCapabilityMap
): Array<{ value: OperatorAuthorityPath; label: string }> {
  return selectedTokenCapabilityMap && selectedTokenCapabilityMap.availableOperatorPaths.length > 0
    ? selectedTokenCapabilityMap.availableOperatorPaths.map((path) => ({
        value: path,
        label: path === "multisig" ? i18n("requiredApprovals") : i18n("owner")
      }))
    : [
        { value: "admin", label: i18n("owner") },
        { value: "multisig", label: i18n("requiredApprovals") }
      ];
}
