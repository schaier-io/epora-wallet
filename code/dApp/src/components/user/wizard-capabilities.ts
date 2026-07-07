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

function hasPositiveInteger(value: string) {
  return /^\d+$/.test(value.trim()) && BigInt(value.trim()) > 0n;
}

function walletsContain(wallets: string[], paymentKeyHash: string | null) {
  return Boolean(paymentKeyHash && wallets.includes(paymentKeyHash));
}

function formatOperatorPathLabel(path: OperatorAuthorityPath) {
  return path === "admin" ? "Admin" : "Multisig";
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

  const availableOperatorPaths: OperatorAuthorityPath[] = [
    ...(hasAdminPath ? ["admin" as const] : []),
    ...(hasMultisigPath ? ["multisig" as const] : [])
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

export function buildAvailableWizardActions(
  capabilityMap: TokenCapabilityMap
): AvailableActionDescriptor[] {
  const actions: AvailableActionDescriptor[] = [
    {
      kind: "lock-funds",
      pathLabels: ["Wallet signer"],
      note: "Add funds."
    }
  ];

  if (capabilityMap.availableOperatorPaths.length > 0) {
    const operatorLabels = capabilityMap.availableOperatorPaths.map(formatOperatorPathLabel);
    actions.push({
      kind: "use",
      pathLabels: operatorLabels,
      note: "Standard send."
    });
  }

  if (capabilityMap.hasDirectUserMatch) {
    actions.push({
      kind: "use-allowance",
      pathLabels: ["User"],
      note: "Use allowance."
    });
  }

  if (capabilityMap.hasBeneficiaryMatch) {
    actions.push({
      kind: "use-beneficiary",
      pathLabels: ["Recovery contact"],
      note: "Use beneficiary path."
    });
  }

  if (capabilityMap.hasStreamingPayments) {
    actions.push({
      kind: "payout-streaming-payment",
      pathLabels: ["Rule-driven"],
      note: "Pay due streaming payments."
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

  actions.push("wallet-spend");

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
