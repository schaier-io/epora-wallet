import type { Data } from "@meshsdk/common";
import { DEFAULT_STATE_DATUM } from "@/lib/contracts/defaults";
import type { ConstrData } from "@/lib/types/contracts";
import {
  INTENDED_STAKE_CREDENTIAL_NONE,
  LAST_PERMISSIONLESS_PAYOUT_AT_NONE,
  isConstrData,
  readStateSections
} from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import {
  DEFAULT_WALLET_NAME,
  decodeWalletNameFromDatum,
  encodeWalletNameForDatum
} from "@/lib/contracts/state-wallet-name";
import { parseValueData } from "@/lib/contracts/value-data";
import { decodePayoutAddressFromData } from "@/lib/contracts/payout-address";
import {
  parseNonNegativeIntegerString,
  serializeBeneficiary,
  serializeOptionInteger,
  serializeStreamingPayment,
  serializeUser
} from "@/lib/contracts/state-form-encode";

type OptionMode = "none" | "some";
export type ProofOfLifeOverrideMode = "auto" | "none" | "specific";

export type StateAssetAmountForm = {
  policyId: string;
  assetName: string;
  amount: string;
};

export type UserPreset = "admin" | "limited-withdrawal" | "custom";

export type UserFormState = {
  id: string;
  wallets: string[];
  perDayAllowance: StateAssetAmountForm[];
  remainingAllowance: StateAssetAmountForm[];
  nextAllowanceReset: string;
  canRenewProofOfLife: boolean;
  multiSigPowerMode: OptionMode;
  multiSigPower: string;
  isAdmin: boolean;
  preset: UserPreset;
};

export type BeneficiaryFormState = {
  id: string;
  wallets: string[];
  unlockAfterMode: OptionMode;
  unlockAfter: string;
  // Proportional share of the distributable pool. On-chain `weight` (Int, >= 1).
  weight: string;
};

export type StreamingPaymentFormState = {
  id: string;
  payoutAddress: string;
  paidOutAmount: string;
  policyId: string;
  assetName: string;
  amountPerDay: string;
  startDate: string;
  endDate: string;
};

export type StateFormState = {
  walletName: string;
  users: UserFormState[];
  multiSigThresholdMode: OptionMode;
  multiSigThreshold: string;
  beneficiaries: BeneficiaryFormState[];
  proofOfLifeUnlockTimeMode: OptionMode;
  proofOfLifeUnlockTime: string;
  proofOfLifeIncrementMode: OptionMode;
  proofOfLifeIncrement: string;
  streamingPayments: StreamingPaymentFormState[];
  // `intended_stake_credential: Option<Credential>` carried as the raw datum so
  // it round-trips through edits (it is changed only via the dedicated
  // admin/multisig SetIntendedStakeCredential action, not this general form).
  intendedStakeCredential: Data;
  // `last_permissionless_payout_at: Option<POSIXTime>` carried as the raw datum so
  // it round-trips unchanged through edits. The STT validator forbids any
  // non-crank transition from changing it, so the form must echo the on-chain
  // value back; new wallets default to `None`.
  lastPermissionlessPayoutAt: Data;
};

type OptionInteger = { kind: "none" } | { kind: "some"; value: number };

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function readInteger(value: unknown): number | null {
  return isInteger(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  if (!isConstrData(value) || value.fields.length !== 0) {
    return null;
  }

  if (value.alternative === 0) {
    return false;
  }

  if (value.alternative === 1) {
    return true;
  }

  return null;
}

function readOptionInteger(value: unknown): OptionInteger | null {
  if (!isConstrData(value)) {
    return null;
  }

  if (value.alternative === 1 && value.fields.length === 0) {
    return { kind: "none" };
  }

  if (value.alternative === 0 && value.fields.length === 1 && isInteger(value.fields[0])) {
    return { kind: "some", value: value.fields[0] };
  }

  return null;
}

function parseWalletList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function createDefaultStateAssetAmountForm(): StateAssetAmountForm {
  return {
    policyId: "",
    assetName: "",
    amount: "0"
  };
}

function createDefaultUserFormState(id = "0"): UserFormState {
  return applyUserPreset(
    {
      id,
      wallets: [],
      perDayAllowance: [],
      remainingAllowance: [],
      nextAllowanceReset: "0",
      canRenewProofOfLife: false,
      multiSigPowerMode: "none",
      multiSigPower: "",
      isAdmin: false,
      preset: "limited-withdrawal"
    },
    "limited-withdrawal"
  );
}

function inferUserPreset(user: Omit<UserFormState, "preset">): UserPreset {
  if (user.isAdmin) {
    return "admin";
  }

  if (!user.canRenewProofOfLife && user.multiSigPowerMode === "none") {
    return "limited-withdrawal";
  }

  return "custom";
}

export function applyUserPreset(user: UserFormState, preset: UserPreset): UserFormState {
  if (preset === "admin") {
    return {
      ...user,
      isAdmin: true,
      canRenewProofOfLife: true,
      multiSigPowerMode: "none",
      multiSigPower: "",
      perDayAllowance: [],
      remainingAllowance: [],
      preset
    };
  }

  if (preset === "limited-withdrawal") {
    return {
      ...user,
      isAdmin: false,
      canRenewProofOfLife: false,
      multiSigPowerMode: "none",
      multiSigPower: "",
      preset
    };
  }

  return {
    ...user,
    preset
  };
}

function createDefaultBeneficiaryFormState(id = "0"): BeneficiaryFormState {
  return {
    id,
    wallets: [],
    unlockAfterMode: "none",
    unlockAfter: "",
    weight: "1"
  };
}

function createDefaultStreamingPaymentFormState(id = "0"): StreamingPaymentFormState {
  return {
    id,
    payoutAddress: "",
    paidOutAmount: "0",
    policyId: "",
    assetName: "",
    amountPerDay: "0",
    startDate: "0",
    endDate: "0"
  };
}

function stateAssetAmountListFromValue(value: unknown): StateAssetAmountForm[] {
  try {
    return parseValueData(value as never, "Asset value").map((entry) => ({
      policyId: entry.policyId,
      assetName: entry.assetName,
      amount: entry.amount.toString()
    }));
  } catch {
    return [];
  }
}

function userFormStateFromValue(value: unknown): UserFormState {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 8) {
    return createDefaultUserFormState();
  }

  const [
    id,
    wallets,
    perDayAllowance,
    remainingAllowance,
    nextAllowanceReset,
    canRenewProofOfLife,
    multiSigPower,
    isAdmin
  ] = value.fields;

  const multiSigPowerOption = readOptionInteger(multiSigPower);
  const isAdminValue = readBoolean(isAdmin) ?? false;
  const canRenewProofOfLifeValue = readBoolean(canRenewProofOfLife) ?? false;

  return {
    id: String(readInteger(id) ?? 0),
    wallets: parseWalletList(wallets),
    perDayAllowance: stateAssetAmountListFromValue(perDayAllowance),
    remainingAllowance: stateAssetAmountListFromValue(remainingAllowance),
    nextAllowanceReset: String(readInteger(nextAllowanceReset) ?? 0),
    canRenewProofOfLife: isAdminValue ? true : canRenewProofOfLifeValue,
    multiSigPowerMode: multiSigPowerOption?.kind === "some" ? "some" : "none",
    multiSigPower: multiSigPowerOption?.kind === "some" ? String(multiSigPowerOption.value) : "",
    isAdmin: isAdminValue,
    preset: "custom"
  };
}

function beneficiaryFormStateFromValue(value: unknown): BeneficiaryFormState {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 4) {
    return createDefaultBeneficiaryFormState();
  }

  const [id, wallets, unlockAfter, weight] = value.fields;
  const unlockAfterOption = readOptionInteger(unlockAfter);

  return {
    id: String(readInteger(id) ?? 0),
    wallets: parseWalletList(wallets),
    unlockAfterMode: unlockAfterOption?.kind === "some" ? "some" : "none",
    unlockAfter:
      unlockAfterOption?.kind === "some" ? String(unlockAfterOption.value) : "",
    weight: String(readInteger(weight) ?? 1)
  };
}

function streamingPaymentFormStateFromValue(value: unknown): StreamingPaymentFormState {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 8) {
    return createDefaultStreamingPaymentFormState();
  }

  const [
    id,
    payoutAddress,
    paidOutAmount,
    policyId,
    assetName,
    amountPerDay,
    startDate,
    endDate
  ] = value.fields;

  return {
    id: String(readInteger(id) ?? 0),
    payoutAddress: decodePayoutAddressFromData(payoutAddress),
    paidOutAmount: String(readInteger(paidOutAmount) ?? 0),
    policyId: readString(policyId) ?? "",
    assetName: readString(assetName) ?? "",
    amountPerDay: String(readInteger(amountPerDay) ?? 0),
    startDate: String(readInteger(startDate) ?? 0),
    endDate: String(readInteger(endDate) ?? 0)
  };
}

export function createDefaultStateForm(): StateFormState {
  return {
    walletName: DEFAULT_WALLET_NAME,
    users: [],
    multiSigThresholdMode: "none",
    multiSigThreshold: "",
    beneficiaries: [],
    proofOfLifeUnlockTimeMode: "none",
    proofOfLifeUnlockTime: "",
    proofOfLifeIncrementMode: "none",
    proofOfLifeIncrement: "",
    streamingPayments: [],
    intendedStakeCredential: INTENDED_STAKE_CREDENTIAL_NONE,
    lastPermissionlessPayoutAt: LAST_PERMISSIONLESS_PAYOUT_AT_NONE
  };
}

export function stateFormFromDatum(datum: ConstrData | null | undefined): StateFormState {
  const source = datum ?? DEFAULT_STATE_DATUM;
  let stateDatum: ConstrData;

  try {
    stateDatum = unwrapStateDatum(source, "State form datum");
  } catch {
    return createDefaultStateForm();
  }
  let sections;

  try {
    sections = readStateSections(stateDatum, "State form datum");
  } catch {
    return createDefaultStateForm();
  }

  const multiSigThresholdOption = readOptionInteger(sections.multiSigThreshold);
  const proofUnlockOption = readOptionInteger(sections.unlockTime);
  const proofIncrementOption = readOptionInteger(sections.increment);

  return {
    walletName: decodeWalletNameFromDatum(sections.walletName),
    users: sections.users.map((entry) => {
      const user = userFormStateFromValue(entry);
      return {
        ...user,
        preset: inferUserPreset(user)
      };
    }),
    multiSigThresholdMode: multiSigThresholdOption?.kind === "some" ? "some" : "none",
    multiSigThreshold:
      multiSigThresholdOption?.kind === "some"
        ? String(multiSigThresholdOption.value)
        : "",
    beneficiaries: sections.beneficiaries.map(beneficiaryFormStateFromValue),
    proofOfLifeUnlockTimeMode: proofUnlockOption?.kind === "some" ? "some" : "none",
    proofOfLifeUnlockTime:
      proofUnlockOption?.kind === "some" ? String(proofUnlockOption.value) : "",
    proofOfLifeIncrementMode: proofIncrementOption?.kind === "some" ? "some" : "none",
    proofOfLifeIncrement:
      proofIncrementOption?.kind === "some"
        ? String(proofIncrementOption.value)
        : "",
    streamingPayments: sections.streamingPayments.map(streamingPaymentFormStateFromValue),
    intendedStakeCredential: sections.intendedStakeCredential,
    lastPermissionlessPayoutAt: sections.lastPermissionlessPayoutAt
  };
}

export function stateFormToDatum(
  form: StateFormState,
  _walletWitness?: ConstrData
): ConstrData {
  void _walletWitness;

  const accessControl: ConstrData = {
    alternative: 0,
    fields: [
      form.users.map(serializeUser),
      serializeOptionInteger(
        form.multiSigThresholdMode,
        form.multiSigThreshold,
        "Multi-sig threshold"
      ),
      form.beneficiaries.map(serializeBeneficiary)
    ]
  };

  const proofOfLife: ConstrData = {
    alternative: 0,
    fields: [
      serializeOptionInteger(
        form.proofOfLifeUnlockTimeMode,
        form.proofOfLifeUnlockTime,
        "Proof-of-life unlock time"
      ),
      serializeOptionInteger(
        form.proofOfLifeIncrementMode,
        form.proofOfLifeIncrement,
        "Proof-of-life increment"
      )
    ]
  };

  return {
    alternative: 0,
    fields: [
      accessControl,
      proofOfLife,
      form.streamingPayments.map(serializeStreamingPayment),
      encodeWalletNameForDatum(form.walletName),
      form.intendedStakeCredential,
      form.lastPermissionlessPayoutAt
    ]
  };
}

function nextGeneratedId(items: Array<{ id: string }>) {
  return String(
    items.reduce((maxId, item) => {
      if (!/^-?\d+$/.test(item.id.trim())) {
        return maxId;
      }

      return Math.max(maxId, Number(item.id));
    }, -1) + 1
  );
}

export function withFallbackAdminUserInStateForm(
  form: StateFormState,
  adminKeyHash?: string | null
): StateFormState {
  const normalizedKeyHash = adminKeyHash?.trim() ?? "";
  if (!normalizedKeyHash) {
    return form;
  }

  if (form.users.some((user) => user.isAdmin)) {
    return form;
  }

  return {
    ...form,
    users: [
      ...form.users,
      {
        ...createDefaultUserFormState(nextGeneratedId(form.users)),
        wallets: [normalizedKeyHash],
        isAdmin: true,
        preset: "admin",
        canRenewProofOfLife: true
      }
    ]
  };
}

export function applyProofOfLifeOverrideToStateForm(
  form: StateFormState,
  overrideMode: ProofOfLifeOverrideMode,
  specificTimestamp?: number,
  latestTxTimeMs = Date.now()
): StateFormState {
  if (overrideMode === "none") {
    return {
      ...form,
      proofOfLifeUnlockTimeMode: "none",
      proofOfLifeUnlockTime: "",
      proofOfLifeIncrementMode: "none",
      proofOfLifeIncrement: ""
    };
  }

  if (overrideMode === "specific") {
    if (
      typeof specificTimestamp !== "number" ||
      !Number.isFinite(specificTimestamp) ||
      !Number.isSafeInteger(specificTimestamp) ||
      specificTimestamp < 0
    ) {
      throw new Error("Proof-of-life override date must resolve to a valid POSIX timestamp.");
    }

    if (form.proofOfLifeIncrementMode === "none") {
      throw new Error(
        "Cannot set a specific proof-of-life date when proof_of_life_increment is None."
      );
    }

    return {
      ...form,
      proofOfLifeUnlockTimeMode: "some",
      proofOfLifeUnlockTime: String(specificTimestamp)
    };
  }

  if (form.proofOfLifeIncrementMode === "none") {
    return form;
  }

  const increment = parseNonNegativeIntegerString(
    form.proofOfLifeIncrement,
    "Proof-of-life increment"
  );
  const nextUnlockTime = latestTxTimeMs + increment;
  const currentUnlockTime =
    form.proofOfLifeUnlockTimeMode === "some"
      ? parseNonNegativeIntegerString(
          form.proofOfLifeUnlockTime,
          "Proof-of-life unlock time"
        )
      : null;
  const effectiveUnlockTime =
    typeof currentUnlockTime === "number" && currentUnlockTime > nextUnlockTime
      ? currentUnlockTime
      : nextUnlockTime;

  if (!Number.isSafeInteger(effectiveUnlockTime) || effectiveUnlockTime < 0) {
    throw new Error(
      "Computed proof-of-life unlock time is outside the supported integer range."
    );
  }

  return {
    ...form,
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: String(effectiveUnlockTime)
  };
}

export function countAdminUsersInStateForm(form: StateFormState) {
  return form.users.filter((user) => user.isAdmin).length;
}

export {
  createDefaultBeneficiaryFormState,
  createDefaultStateAssetAmountForm,
  createDefaultStreamingPaymentFormState,
  createDefaultUserFormState,
  nextGeneratedId
};
