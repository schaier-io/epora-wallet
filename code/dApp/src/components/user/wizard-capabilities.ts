import type { StateFormState } from "@/lib/contracts/state-form";
import type {
  ConsolidateAuthorityPath,
  OperatorAuthorityPath
} from "@/lib/types/contracts";
import type {
  AvailableActionDescriptor,
  TokenCapabilityMap,
  UserActionKind
} from "@/components/user/flow-types";
import { filterGuidedUserActions } from "@/lib/user-flow/guided-helpers";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWizardCapabilities.json";

const i18n = createDefaultTranslator("ComponentsUserWizardCapabilities", defaultMessages);

function hasPositiveInteger(value: string) {
  return /^\d+$/.test(value.trim()) && BigInt(value.trim()) > 0n;
}

function walletsContain(wallets: string[], paymentKeyHash: string | null) {
  return Boolean(paymentKeyHash && wallets.includes(paymentKeyHash));
}

function formatOperatorPathLabel(path: OperatorAuthorityPath) {
  return path === "admin" ? i18n("owner") : i18n("coSigners");
}

export function resolveTokenCapabilityMap({
  state,
  paymentKeyHash,
  lockedUtxoCount,
  lockedUtxosLoading
}: {
  state: StateFormState;
  paymentKeyHash: string | null;
  lockedUtxoCount: number;
  lockedUtxosLoading: boolean;
}): TokenCapabilityMap {
  const hasAdminPath = state.users.some((user) => user.isAdmin);
  const hasDirectAdminSigner = state.users.some(
    (user) => user.isAdmin && walletsContain(user.wallets, paymentKeyHash)
  );
  const hasMultisigPath =
    state.multiSigThresholdMode === "some" &&
    hasPositiveInteger(state.multiSigThreshold) &&
    state.users.some(
      (user) => user.multiSigPowerMode === "some" && hasPositiveInteger(user.multiSigPower)
    );
  const hasDirectUserMatch = state.users.some((user) =>
    walletsContain(user.wallets, paymentKeyHash)
  );
  const hasDirectProofOfLifeRenewalMatch = state.users.some(
    (user) =>
      !user.isAdmin &&
      user.canRenewProofOfLife &&
      walletsContain(user.wallets, paymentKeyHash)
  );
  const hasBeneficiaryMatch = state.beneficiaries.some((beneficiary) =>
    walletsContain(beneficiary.wallets, paymentKeyHash)
  );
  const hasStreamingPayments = state.streamingPayments.length > 0;
  const hasLockedUtxos = lockedUtxoCount > 0;

  const hasDirectMultisigSigner =
    hasMultisigPath &&
    state.users.some(
      (user) =>
        user.multiSigPowerMode === "some" &&
        hasPositiveInteger(user.multiSigPower) &&
        walletsContain(user.wallets, paymentKeyHash)
    );

  // What the wallet HAS, versus what the connected key HOLDS. `hasAdminPath` and
  // `hasMultisigPath` answer the first question only, and these paths used to be built
  // from them, so every wallet with an owner offered "Send funds", "Manage people" and
  // "Wallet settings" to a stranger. Every smart wallet on the policy is listed to
  // everyone, because `lib/mesh/detection.ts` scans the policy rather than the connected
  // account, so "a stranger" is the normal case, not a corner one. The build then took its required
  // signer from the live wallet (`lib/mesh/transactions/internals/core.ts`) and came back
  // from Blockfrost as an unreadable "Evaluate redeemers failed".
  const availableOperatorPaths: OperatorAuthorityPath[] = [
    ...(hasDirectAdminSigner ? ["admin" as const] : []),
    ...(hasDirectMultisigSigner ? ["multisig" as const] : [])
  ];

  const availableConsolidatePaths: ConsolidateAuthorityPath[] = [
    ...availableOperatorPaths,
    ...(hasBeneficiaryMatch ? ["beneficiary" as const] : [])
  ];

  return {
    hasAdminPath,
    hasDirectAdminSigner,
    hasMultisigPath,
    hasDirectUserMatch,
    hasDirectProofOfLifeRenewalMatch,
    hasBeneficiaryMatch,
    hasStreamingPayments,
    hasLockedUtxos,
    lockedUtxosLoading,
    availableOperatorPaths,
    availableConsolidatePaths
  };
}

/**
 * Does the CONNECTED key hold any role in this wallet?
 *
 * One definition, because two places need the same answer: which wallet to open by default,
 * and whether to show the wallet workspace at all. Every smart wallet on the policy is listed
 * to every visitor, so "no role here" is an ordinary state, not an error.
 *
 * `hasStreamingPayments` is deliberately not part of it. A wallet HAVING scheduled payments
 * says nothing about whether they are paid to the connected key; the payee surface is
 * `/payee`, which reads the schedules by their payout address.
 */
export function holdsAnyRole(capabilityMap: TokenCapabilityMap) {
  return (
    capabilityMap.hasDirectAdminSigner ||
    capabilityMap.hasDirectUserMatch ||
    capabilityMap.hasBeneficiaryMatch
  );
}

export function buildAvailableWizardActions(
  capabilityMap: TokenCapabilityMap
): AvailableActionDescriptor[] {
  const actions: AvailableActionDescriptor[] = [
    {
      kind: "lock-funds",
      pathLabels: [i18n("walletSigner")],
      note: i18n("addFunds")
    }
  ];

  if (capabilityMap.availableOperatorPaths.length > 0) {
    const operatorLabels = capabilityMap.availableOperatorPaths.map(formatOperatorPathLabel);
    actions.push({
      kind: "use",
      pathLabels: operatorLabels,
      note: i18n("standardSend")
    });
  }

  if (capabilityMap.hasDirectUserMatch) {
    actions.push({
      kind: "use-allowance",
      pathLabels: [i18n("spender")],
      note: i18n("useAllowance")
    });
  }

  if (capabilityMap.hasBeneficiaryMatch) {
    actions.push({
      kind: "use-beneficiary",
      pathLabels: [i18n("recoveryContact")],
      note: i18n("useRecoveryContactAccess")
    });
  }

  if (capabilityMap.hasStreamingPayments) {
    actions.push({
      kind: "payout-streaming-payment",
      pathLabels: [i18n("ruleDriven")],
      note: i18n("payDueScheduledPayments")
    });
  }

  return filterGuidedUserActions(actions);
}

export function buildAdvancedWizardActions(
  capabilityMap: TokenCapabilityMap
): UserActionKind[] {
  const actions: UserActionKind[] = [];

  if (capabilityMap.availableOperatorPaths.length > 0) {
    actions.push(
      "wallet-withdraw",
      "set-intended-stake-credential",
      "update-state",
      "manage-streaming-payments",
      "wallet-publish",
      "wallet-vote"
    );
  }

  if (
    capabilityMap.availableConsolidatePaths.length > 0 &&
    capabilityMap.hasLockedUtxos
  ) {
    actions.push("consolidate-utxo");
  }

  if (capabilityMap.hasDirectProofOfLifeRenewalMatch) {
    actions.push("renew-proof-of-life");
  }

  return actions;
}

export function chooseDefaultOperatorPath(
  capabilityMap: TokenCapabilityMap
): OperatorAuthorityPath {
  if (capabilityMap.hasAdminPath && capabilityMap.hasDirectAdminSigner) {
    return "admin";
  }

  if (capabilityMap.hasMultisigPath) {
    return "multisig";
  }

  return "admin";
}

export function chooseDefaultConsolidatePath(
  capabilityMap: TokenCapabilityMap
): ConsolidateAuthorityPath {
  if (capabilityMap.hasAdminPath && capabilityMap.hasDirectAdminSigner) {
    return "admin";
  }

  if (capabilityMap.hasMultisigPath) {
    return "multisig";
  }

  if (capabilityMap.hasAdminPath) {
    return "admin";
  }

  if (capabilityMap.hasBeneficiaryMatch) {
    return "beneficiary";
  }

  return "admin";
}
