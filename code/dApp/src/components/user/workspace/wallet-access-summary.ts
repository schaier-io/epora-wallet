import type {
  StateAssetAmountForm,
  StateFormState,
  UserFormState
} from "@/lib/contracts/state-form";

export type WalletAccessRole =
  | "owner"
  | "co-signer"
  | "spender"
  | "proof-of-life"
  | "recovery"
  | "listed-user";

export type WalletAccessSummary = {
  readOnly: boolean;
  roles: WalletAccessRole[];
  canSend: boolean;
  canManageWallet: boolean;
  canRenewProofOfLife: boolean;
  approvalPowers: string[];
  approvalThreshold: string | null;
  dailyAllowances: StateAssetAmountForm[];
  recoveryAccess: Array<{ weight: string; unlockAfter: string | null }>;
};

export function formatConfiguredAllowance(entry: StateAssetAmountForm) {
  if (!entry.policyId.trim() && !entry.assetName.trim()) {
    return `${entry.amount.trim()} ₳`;
  }
  return `${entry.amount.trim()} ${entry.assetName.trim() || entry.policyId.trim()}`;
}

function isPositiveNumberText(value: string) {
  const normalized = value.trim();
  return /^\d+(?:\.\d+)?$/.test(normalized) && /[1-9]/.test(normalized);
}

export function positiveAllowanceEntries(user: UserFormState) {
  return user.perDayAllowance.filter(({ amount }) => isPositiveNumberText(amount));
}

export function userHasPositiveAllowance(user: UserFormState) {
  return positiveAllowanceEntries(user).length > 0;
}

function effectiveRecoveryUnlockTime(
  state: StateFormState,
  beneficiaryUnlockMode: "none" | "some",
  beneficiaryUnlock: string
) {
  const values = [
    state.proofOfLifeUnlockTimeMode === "some" ? state.proofOfLifeUnlockTime : "",
    beneficiaryUnlockMode === "some" ? beneficiaryUnlock : ""
  ]
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .map(BigInt);

  if (values.length === 0) return null;
  return values.reduce((latest, value) => (value > latest ? value : latest)).toString();
}

export function deriveWalletAccessSummary(
  state: StateFormState,
  paymentKeyHash: string | null
): WalletAccessSummary {
  if (!paymentKeyHash) {
    return {
      readOnly: true,
      roles: [],
      canSend: false,
      canManageWallet: false,
      canRenewProofOfLife: false,
      approvalPowers: [],
      approvalThreshold: null,
      dailyAllowances: [],
      recoveryAccess: []
    };
  }

  const users = state.users.filter((user) => user.wallets.includes(paymentKeyHash));
  const beneficiaries = state.beneficiaries.filter((entry) =>
    entry.wallets.includes(paymentKeyHash)
  );
  const owners = users.filter((user) => user.isAdmin);
  const coSigners = state.multiSigThresholdMode === "some"
    ? users.filter(
        (user) =>
          user.multiSigPowerMode === "some" && isPositiveNumberText(user.multiSigPower)
      )
    : [];
  const spenders = users.filter(userHasPositiveAllowance);
  const canRenewProofOfLife = users.some((user) => user.canRenewProofOfLife);
  const roles: WalletAccessRole[] = [];

  if (owners.length > 0) roles.push("owner");
  if (coSigners.length > 0) roles.push("co-signer");
  if (spenders.length > 0) roles.push("spender");
  if (canRenewProofOfLife) roles.push("proof-of-life");
  if (beneficiaries.length > 0) roles.push("recovery");
  if (roles.length === 0 && users.length > 0) roles.push("listed-user");

  return {
    readOnly: false,
    roles,
    canSend: owners.length > 0 || coSigners.length > 0 || spenders.length > 0 || beneficiaries.length > 0,
    canManageWallet: owners.length > 0 || coSigners.length > 0,
    canRenewProofOfLife,
    approvalPowers: coSigners.map((user) => user.multiSigPower.trim()),
    approvalThreshold:
      coSigners.length > 0 && isPositiveNumberText(state.multiSigThreshold)
        ? state.multiSigThreshold.trim()
        : null,
    dailyAllowances: spenders.flatMap(positiveAllowanceEntries),
    recoveryAccess: beneficiaries.map((entry) => ({
      weight: entry.weight.trim() || "1",
      unlockAfter: effectiveRecoveryUnlockTime(state, entry.unlockAfterMode, entry.unlockAfter)
    }))
  };
}
