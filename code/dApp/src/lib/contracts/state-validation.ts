import type { Data } from "@meshsdk/common";
import type { ConstrData } from "@/lib/types/contracts";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import {
  MAX_WALLET_NAME_BYTES,
  walletNameDatumByteLength
} from "@/lib/contracts/state-wallet-name";
import {
  MAX_ALLOWANCE_ENTRIES,
  MAX_BENEFICIARIES,
  MAX_BENEFICIARY_WALLETS,
  MAX_STREAMING_PAYMENTS,
  MAX_USERS,
  MAX_WALLETS_PER_USER,
  readOption,
  readWalletEntries,
  validateBeneficiary,
  validateByteArray,
  validateInteger,
  validateStreamingPayment,
  validateUser
} from "@/lib/contracts/state-validation-records";

// Re-export the on-chain cap mirrors so existing call sites can keep importing
// them from this module (the validators that enforce them now live in
// `state-validation-records.ts`).
export {
  MAX_ALLOWANCE_ENTRIES,
  MAX_BENEFICIARIES,
  MAX_BENEFICIARY_WALLETS,
  MAX_STREAMING_PAYMENTS,
  MAX_USERS,
  MAX_WALLETS_PER_USER
};

function walletListsOverlap(leftWallets: string[], rightWallets: string[]) {
  return leftWallets.some((wallet) => rightWallets.includes(wallet));
}

function findDuplicateWallets(wallets: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const wallet of wallets) {
    if (seen.has(wallet)) {
      duplicates.add(wallet);
    } else {
      seen.add(wallet);
    }
  }

  return [...duplicates];
}

function readUserAccessSummary(value: Data): {
  isAdmin: boolean;
  hasWallets: boolean;
  multiSigPower: number;
} | null {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 8) {
    return null;
  }

  const wallets = readWalletEntries(value.fields[1]);
  const isAdmin =
    isConstrData(value.fields[7]) && value.fields[7].fields.length === 0
      ? value.fields[7].alternative === 1
      : false;
  const multiSigPowerOption = isConstrData(value.fields[6]) ? value.fields[6] : null;
  const multiSigPower =
    multiSigPowerOption &&
    multiSigPowerOption.alternative === 0 &&
    multiSigPowerOption.fields.length === 1 &&
    typeof multiSigPowerOption.fields[0] === "number" &&
    Number.isInteger(multiSigPowerOption.fields[0]) &&
    multiSigPowerOption.fields[0] > 0
      ? multiSigPowerOption.fields[0]
      : 0;

  return {
    isAdmin,
    hasWallets: wallets.length > 0,
    multiSigPower
  };
}

function readAdminUserCount(users: Data[]) {
  return users.reduce<number>((count, user) => {
    const summary = readUserAccessSummary(user);
    return summary?.isAdmin ? count + 1 : count;
  }, 0);
}

function readBeneficiaryAccessSummary(value: Data) {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 4) {
    return null;
  }

  const [, beneficiaryWallets] = value.fields;

  // Under the weighted-share model the beneficiary set collectively drains the
  // entire distributable pool — but only because every beneficiary is required
  // to carry a signable wallet (enforced as a hard error in `validateBeneficiary`
  // / on-chain `expect_beneficiaries_are_valid`). With that invariant, any
  // present beneficiary is a reachable non-admin recovery path.
  return {
    hasWallets: readWalletEntries(beneficiaryWallets).length > 0
  };
}

type ThresholdOption = { kind: "none" } | { kind: "some"; value: Data } | null;

function hasReachableMultisigPath(users: Data[], threshold: ThresholdOption): boolean {
  if (
    !threshold ||
    threshold.kind !== "some" ||
    typeof threshold.value !== "number" ||
    !Number.isInteger(threshold.value) ||
    threshold.value <= 0
  ) {
    return false;
  }

  const availablePower = users.reduce<number>((power, user) => {
    const summary = readUserAccessSummary(user);
    if (!summary?.hasWallets) {
      return power;
    }

    return power + summary.multiSigPower;
  }, 0);

  return availablePower >= threshold.value;
}

function zeroAdminStateHasUserSideAccessPath(
  users: Data[],
  threshold: ThresholdOption,
  beneficiaries: Data[]
) {
  if (readAdminUserCount(users) > 0) {
    return true;
  }

  const hasFullDrainBeneficiaryPath = beneficiaries.some((beneficiary) => {
    const summary = readBeneficiaryAccessSummary(beneficiary);
    return summary?.hasWallets ?? false;
  });
  if (hasFullDrainBeneficiaryPath) {
    return true;
  }

  return hasReachableMultisigPath(users, threshold);
}

function validateProofOfLifeSettings(
  proofOfLifeUnlockTime: Data,
  proofOfLifeIncrement: Data,
  errors: string[]
) {
  const unlockTime = readOption(
    proofOfLifeUnlockTime,
    "state.proof_of_life_unlock_time",
    errors
  );
  const increment = readOption(
    proofOfLifeIncrement,
    "state.proof_of_life_increment",
    errors
  );

  if (!unlockTime || !increment) {
    return;
  }

  if (unlockTime.kind === "none" && increment.kind === "none") {
    return;
  }

  if (unlockTime.kind === "some" && increment.kind === "some") {
    validateInteger(
      unlockTime.value,
      "state.proof_of_life_unlock_time.Some",
      errors,
      { min: 0 }
    );
    validateInteger(
      increment.value,
      "state.proof_of_life_increment.Some",
      errors,
      { min: 0 }
    );
    return;
  }

  errors.push(
    "state.proof_of_life_unlock_time and state.proof_of_life_increment must both be set or both be None."
  );
}

export function validateStateDatum(
  stateDatum: ConstrData,
  _options: { expectedPerformedAction?: ConstrData } = {}
): string[] {
  void _options;

  const errors: string[] = [];
  let sections;

  try {
    sections = readStateSections(stateDatum, "stateDatum");
  } catch (error) {
    return [error instanceof Error ? error.message : "stateDatum has an invalid shape."];
  }

  if (sections.walletName !== null) {
    if (validateByteArray(sections.walletName, "state.wallet_name", errors)) {
      const nameBytes = walletNameDatumByteLength(sections.walletName);
      if (nameBytes > MAX_WALLET_NAME_BYTES) {
        errors.push(`Wallet name must fit in ${MAX_WALLET_NAME_BYTES} bytes.`);
      }
    }
  }

  const beneficiaryWalletLists: string[][] = [];

  if (sections.users.length > MAX_USERS) {
    errors.push(
      `A wallet can have at most ${MAX_USERS} owners. This keeps every wallet action affordable on-chain; remove an owner to make room.`
    );
  }

  const seenUserIds = new Set<number>();
  for (const [index, user] of sections.users.entries()) {
    const id = validateUser(user, `state.users[${index}]`, errors);

    if (typeof id === "number") {
      if (seenUserIds.has(id)) {
        errors.push(`state.users contains duplicate id ${id}.`);
      } else {
        seenUserIds.add(id);
      }
    }
  }

  const threshold = readOption(sections.multiSigThreshold, "state.multi_sig_threshold", errors);
  if (threshold?.kind === "some") {
    validateInteger(threshold.value, "state.multi_sig_threshold.Some", errors, { min: 0 });
  }

  if (sections.beneficiaries.length > MAX_BENEFICIARIES) {
    errors.push(
      `A wallet can have at most ${MAX_BENEFICIARIES} recovery contacts. This keeps every wallet action affordable on-chain; remove one to make room.`
    );
  }

  const seenBeneficiaryIds = new Set<number>();
  for (const [index, beneficiary] of sections.beneficiaries.entries()) {
    const id = validateBeneficiary(beneficiary, `state.beneficiaries[${index}]`, errors);
    const walletEntries =
      isConstrData(beneficiary) && beneficiary.alternative === 0 && beneficiary.fields.length === 4
        ? readWalletEntries(beneficiary.fields[1])
        : [];
    beneficiaryWalletLists[index] = walletEntries;

    if (typeof id === "number") {
      if (seenBeneficiaryIds.has(id)) {
        errors.push(`state.beneficiaries contains duplicate id ${id}.`);
      } else {
        seenBeneficiaryIds.add(id);
      }
    }
  }

  for (const [index, wallets] of beneficiaryWalletLists.entries()) {
    for (const duplicateWallet of findDuplicateWallets(wallets)) {
      errors.push(
        `state.beneficiaries[${index}].beneficiary_wallets contains duplicate wallet ${duplicateWallet}.`
      );
    }

    for (let otherIndex = index + 1; otherIndex < beneficiaryWalletLists.length; otherIndex += 1) {
      if (walletListsOverlap(wallets, beneficiaryWalletLists[otherIndex] ?? [])) {
        errors.push(
          `state.beneficiaries[${index}] and state.beneficiaries[${otherIndex}] must not share beneficiary wallets.`
        );
      }
    }
  }

  validateProofOfLifeSettings(sections.unlockTime, sections.increment, errors);
  const proofUnlockOption = readOption(
    sections.unlockTime,
    "state.proof_of_life_unlock_time",
    []
  );
  if (
    sections.beneficiaries.length > 0 &&
    (!proofUnlockOption || proofUnlockOption.kind !== "some")
  ) {
    errors.push(
      "Beneficiaries need a safety timer before they can be used."
    );
  }

  if (
    !zeroAdminStateHasUserSideAccessPath(
      sections.users,
      threshold,
      sections.beneficiaries
    )
  ) {
    errors.push(
      "Add at least one owner, or add a recovery path that can still use the wallet."
    );
  }

  if (sections.streamingPayments.length > MAX_STREAMING_PAYMENTS) {
    errors.push(
      `A wallet can have at most ${MAX_STREAMING_PAYMENTS} streaming payments. This keeps every wallet action affordable on-chain.`
    );
  }

  const seenStreamingPaymentIds = new Set<number>();
  for (const [index, streamingPayment] of sections.streamingPayments.entries()) {
    const id = validateStreamingPayment(streamingPayment, `Streaming payment ${index + 1}`, errors);
    if (typeof id === "number") {
      if (seenStreamingPaymentIds.has(id)) {
        errors.push(`state.streamingPayments contains duplicate id ${id}.`);
      } else {
        seenStreamingPaymentIds.add(id);
      }
    }
  }
  return errors;
}

export function validateMintStateDatum(stateDatum: ConstrData): string[] {
  return validateStateDatum(stateDatum);
}

// ---------------------------------------------------------------------------
// Soft advisories (non-blocking). Unlike `validateStateDatum` — whose entries
// are hard errors that block a transaction — these flag configurations that are
// VALID on-chain but risky for the wallet owner. This mirrors the on-chain
// stance documented in `lib/state/configuration.ak`: the contract rejects only
// a genuine full lock, so a *distant-but-finite* recovery time is accepted
// on-chain and surfaced as a warning here instead.
// ---------------------------------------------------------------------------

// ~10 years. A sole beneficiary recovery gated this far out is almost certainly
// a misconfiguration (an effective time-lock brick), not deliberate intent.
const FAR_FUTURE_UNLOCK_HORIZON_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function readOptionIntegerValue(value: Data): number | null {
  const option = readOption(value, "", []);
  if (
    option?.kind === "some" &&
    typeof option.value === "number" &&
    Number.isInteger(option.value)
  ) {
    return option.value;
  }

  return null;
}

/**
 * Non-blocking advisories about a state datum. Currently warns when the wallet
 * has NO operator path (no admin, no satisfiable multisig) and its only
 * recovery is a beneficiary whose earliest possible unlock is far in the future
 * — i.e. an "unbounded `unlock_after` as the sole recovery path" that leaves the
 * wallet effectively time-locked. On-chain accepts this (it is recoverable, not
 * a full lock), so the caller should surface these as warnings, not errors.
 */
export function collectStateDatumWarnings(
  stateDatum: ConstrData,
  nowMs: number = Date.now()
): string[] {
  const warnings: string[] = [];

  let sections;
  try {
    sections = readStateSections(stateDatum, "stateDatum");
  } catch {
    // Shape problems are `validateStateDatum`'s job; nothing to advise here.
    return warnings;
  }

  const proofUnlock = readOptionIntegerValue(sections.unlockTime);

  // The earliest a signable beneficiary can unlock is the soonest the wallet
  // can be recovered through the beneficiary path.
  let earliestUnlock: number | null = null;
  let hasSignableBeneficiary = false;
  for (const beneficiary of sections.beneficiaries) {
    if (!(readBeneficiaryAccessSummary(beneficiary)?.hasWallets ?? false)) {
      continue;
    }
    hasSignableBeneficiary = true;

    const unlockAfter =
      isConstrData(beneficiary) && beneficiary.fields.length === 4
        ? readOptionIntegerValue(beneficiary.fields[2])
        : null;
    const effectiveUnlock = Math.max(unlockAfter ?? 0, proofUnlock ?? 0);
    if (earliestUnlock === null || effectiveUnlock < earliestUnlock) {
      earliestUnlock = effectiveUnlock;
    }
  }

  // (1) Lapsed-unlock advisory. Fires REGARDLESS of operator presence: if a
  // signable beneficiary's effective unlock time is already in the past, that
  // beneficiary can withdraw right now. The contract intentionally accepts an
  // already-lapsed `unlock_time` (it validates shape, not timing — see
  // `lib/state/proof_of_life.ak::expect_valid_settings` and CONTEXT.md
  // §"Recovery reachability"), so this risk is surfaced off-chain here instead
  // of being rejected on-chain. Gated on `proofUnlock !== null` because with no
  // proof-of-life configured a beneficiary can never unlock on-chain
  // (`calculate_beneficiary_unlock_time` returns the -1 sentinel).
  if (
    hasSignableBeneficiary &&
    proofUnlock !== null &&
    earliestUnlock !== null &&
    earliestUnlock <= nowMs
  ) {
    warnings.push(
      "A recovery contact can already withdraw from this wallet now — the wake-up timer has lapsed. If that is not intended, renew the timer or set its unlock time in the future before continuing."
    );
  }

  // (2) Far-future brick advisory. Only relevant when no operator (admin or a
  // satisfiable multisig) can ever act, so the sole recovery is a beneficiary
  // whose unlock is so far out the wallet is effectively time-locked.
  const threshold = readOption(sections.multiSigThreshold, "state.multi_sig_threshold", []);
  const hasOperatorPath =
    readAdminUserCount(sections.users) > 0 ||
    hasReachableMultisigPath(sections.users, threshold);

  if (
    !hasOperatorPath &&
    hasSignableBeneficiary &&
    earliestUnlock !== null &&
    earliestUnlock > nowMs + FAR_FUTURE_UNLOCK_HORIZON_MS
  ) {
    warnings.push(
      "This wallet has no owner and no multisig path, and its only recovery (a recovery contact) cannot unlock until far in the future. Funds will be inaccessible until then — set a sooner unlock time or add another recovery path."
    );
  }

  return warnings;
}
