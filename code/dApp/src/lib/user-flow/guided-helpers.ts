import type { TokenCapabilityMap } from "@/components/user/flow-types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibUserFlowGuidedHelpers.json";

const i18n = createDefaultTranslator("LibUserFlowGuidedHelpers", defaultMessages);

const GUIDED_USER_ACTION_KINDS = [
  "mint",
  "lock-funds",
  "use",
  "update-state",
  "manage-streaming-payments",
  "use-allowance",
  "use-beneficiary",
  "stop-beneficiary-stream",
  "distribute-beneficiaries",
  "payout-streaming-payment"
] as const;

const MAX_RECENT_RECIPIENTS = 5;

export function rememberRecentRecipient(
  recipients: string[],
  address: string,
  maxEntries = MAX_RECENT_RECIPIENTS
) {
  const normalized = address.trim();
  if (!normalized) {
    return recipients;
  }

  return [normalized, ...recipients.filter((entry) => entry !== normalized)].slice(0, maxEntries);
}

export function chooseAutoOpenDetectedWallet<T extends { unit: string }>(wallets: T[]) {
  return wallets.length === 1 ? wallets[0]?.unit ?? null : null;
}

export function derivePermissionWalletBadgeLabels(
  capabilityMap: TokenCapabilityMap
) {
  const badges: string[] = [];

  if (capabilityMap.hasDirectAdminSigner) {
    badges.push(i18n("owner"));
  }
  if (capabilityMap.hasDirectAllowance) {
    badges.push(i18n("allowance"));
  }
  if (capabilityMap.hasBeneficiaryMatch) {
    badges.push(i18n("recovery"));
  }
  if (capabilityMap.hasStreamingPayments) {
    badges.push(i18n("scheduled"));
  }

  if (badges.length === 0) {
    badges.push(i18n("receiveOnly"));
  }

  return badges;
}

export function resolveAutomaticSendPath(
  capabilityMap: TokenCapabilityMap | null
): "use" | "use-allowance" | "use-beneficiary" {
  if (!capabilityMap) {
    return "use";
  }

  if (
    capabilityMap.hasDirectAdminSigner &&
    capabilityMap.availableOperatorPaths.length > 0
  ) {
    return "use";
  }

  if (capabilityMap.hasDirectAllowance) {
    return "use-allowance";
  }

  if (capabilityMap.hasBeneficiaryMatch) {
    return "use-beneficiary";
  }

  if (capabilityMap.availableOperatorPaths.length > 0) {
    return "use";
  }

  return "use";
}

export function deriveWalletHomeFlowAvailability(
  capabilityMap: TokenCapabilityMap | null
) {
  const hasOperatorManagement = capabilityMap
    ? capabilityMap.availableOperatorPaths.length > 0
    : false;
  const canSend = Boolean(
    capabilityMap &&
      (capabilityMap.availableOperatorPaths.length > 0 ||
        capabilityMap.hasDirectAllowance ||
        capabilityMap.hasBeneficiaryMatch)
  );

  return {
    canSend,
    canAddFunds: true,
    canManagePeople: hasOperatorManagement,
    canManageSettings: hasOperatorManagement,
    canPayStreamingPayments: Boolean(capabilityMap?.hasStreamingPayments),
    canManageStreamingPayments: hasOperatorManagement
  };
}

export function filterGuidedUserActions<T extends { kind: string }>(actions: T[]) {
  const allowed = new Set<string>(GUIDED_USER_ACTION_KINDS);
  return actions.filter((action) => allowed.has(action.kind));
}
