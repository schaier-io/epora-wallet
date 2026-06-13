import type { Data } from "@meshsdk/common";
import type { ConstrData } from "@/lib/types/contracts";
import { isConstrData } from "./plutus-primitives";

// Plutus encoding of `intended_stake_credential: Option<Credential> = None`
// (Aiken `Option`: `Some` = constructor 0, `None` = constructor 1). New wallets
// default to this (enterprise address — no delegation).
export const INTENDED_STAKE_CREDENTIAL_NONE: ConstrData = {
  alternative: 1,
  fields: []
};

// Plutus encoding of `last_permissionless_payout_at: Option<POSIXTime> = None`
// (Aiken `Option`: `Some` = constructor 0, `None` = constructor 1). New wallets
// MUST mint with this (the STT validator pins it to `None`); thereafter only the
// permissionless `PayStreamingPayment` crank changes it (the cooldown stamp).
export const LAST_PERMISSIONLESS_PAYOUT_AT_NONE: ConstrData = {
  alternative: 1,
  fields: []
};

// Canonical Plutus-Data guards live in ./plutus-primitives; re-exported here so
// the modules that import isConstrData from state-layout keep working.
export { isConstrData };

function isAccessControlDatum(value: unknown): value is ConstrData {
  return isConstrData(value) && value.alternative === 0 && value.fields.length === 3;
}

function isProofOfLifeDatum(value: unknown): value is ConstrData {
  return isConstrData(value) && value.alternative === 0 && value.fields.length === 2;
}

export function isStateDatum(value: unknown): boolean {
  // The on-chain `State` is now a 6-field constructor
  // (access, proof_of_life, streaming_payments, wallet_name,
  // intended_stake_credential, last_permissionless_payout_at). We accept `>= 4`
  // so a legacy 4- or 5-field datum (pre-`intended_stake_credential` /
  // pre-`last_permissionless_payout_at`) still reads — `readStateSections`
  // defaults the missing fields to `None` — but a 3-field datum (missing
  // `wallet_name`) is still rejected, since the STT validator cannot decode it.
  return (
    isConstrData(value) &&
    value.alternative === 0 &&
    value.fields.length >= 4 &&
    isAccessControlDatum(value.fields[0]) &&
    isProofOfLifeDatum(value.fields[1]) &&
    Array.isArray(value.fields[2]) &&
    typeof value.fields[3] === "string"
  );
}

export type StateSections = {
  state: ConstrData;
  access: ConstrData;
  proofOfLife: ConstrData;
  streamingPayments: Data[];
  users: Data[];
  multiSigThreshold: Data;
  beneficiaries: Data[];
  unlockTime: Data;
  increment: Data;
  walletName: Data | null;
  // `intended_stake_credential: Option<Credential>` (raw datum). Defaults to the
  // `None` constructor for legacy 4-field states.
  intendedStakeCredential: Data;
  // `last_permissionless_payout_at: Option<POSIXTime>` (raw datum). Defaults to
  // the `None` constructor for legacy 4-/5-field states.
  lastPermissionlessPayoutAt: Data;
};

export function readStateSections(
  stateDatum: ConstrData,
  label = "State datum"
): StateSections {
  if (!isStateDatum(stateDatum)) {
    throw new Error(`${label} must be a State constructor with access, proof-of-life, streamingPayments, and optional wallet name fields.`);
  }

  const access = stateDatum.fields[0];
  const proofOfLife = stateDatum.fields[1];
  const streamingPayments = stateDatum.fields[2];
  const walletName = stateDatum.fields.length >= 4 ? stateDatum.fields[3] : null;
  const intendedStakeCredential =
    stateDatum.fields.length >= 5
      ? stateDatum.fields[4]
      : INTENDED_STAKE_CREDENTIAL_NONE;
  const lastPermissionlessPayoutAt =
    stateDatum.fields.length >= 6
      ? stateDatum.fields[5]
      : LAST_PERMISSIONLESS_PAYOUT_AT_NONE;

  if (!isAccessControlDatum(access)) {
    throw new Error(`${label}.access must be an AccessControl constructor.`);
  }

  if (!isProofOfLifeDatum(proofOfLife)) {
    throw new Error(`${label}.proof_of_life must be a ProofOfLifeSettings constructor.`);
  }

  if (!Array.isArray(streamingPayments)) {
    throw new Error(`${label}.streamingPayments must be a list.`);
  }

  const [users, multiSigThreshold, beneficiaries] = access.fields;
  const [unlockTime, increment] = proofOfLife.fields;

  if (!Array.isArray(users)) {
    throw new Error(`${label}.access.users must be a list.`);
  }

  if (!Array.isArray(beneficiaries)) {
    throw new Error(`${label}.access.beneficiaries must be a list.`);
  }

  return {
    state: stateDatum,
    access,
    proofOfLife,
    streamingPayments,
    users,
    multiSigThreshold,
    beneficiaries,
    unlockTime,
    increment,
    walletName,
    intendedStakeCredential,
    lastPermissionlessPayoutAt
  };
}
