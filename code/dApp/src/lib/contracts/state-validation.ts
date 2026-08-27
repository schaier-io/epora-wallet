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
import { isIntendedStakeCredentialData } from "@/lib/contracts/payout-address";

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
  const right = new Set(rightWallets.map((wallet) => wallet.toLowerCase()));
  return leftWallets.some((wallet) => right.has(wallet.toLowerCase()));
}

function findDuplicateWallets(wallets: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const wallet of wallets) {
    const normalized = wallet.toLowerCase();
    if (seen.has(normalized)) {
      duplicates.add(normalized);
    } else {
      seen.add(normalized);
    }
  }

  return [...duplicates];
}

function readUserAccessSummary(value: Data): {
  isAdmin: boolean;
  hasWallets: boolean;
  multiSigPower: number;
  wallets: string[];
} | null {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 8) {
    return null;
  }

  const wallets = readWalletEntries(value.fields[1]!);
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
    multiSigPower,
    wallets
  };
}

// Count only SIGNABLE admins: an `is_admin` user carrying at least one wallet
// key. A wallet-less admin can never sign (`has_operator_authority` matches
// against user_wallets), so on-chain `has_reachable_access_path` does not treat
// it as a recovery path — this mirror must agree, or it would green-light a
// permanently stranded wallet whose only entry is a wallet-less admin. Both
// callers (reachability, far-future-brick advisory) want "can this admin act".
function readAdminUserCount(users: Data[]) {
  return users.reduce<number>((count, user) => {
    const summary = readUserAccessSummary(user);
    return summary?.isAdmin && summary.hasWallets ? count + 1 : count;
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
    hasWallets: readWalletEntries(beneficiaryWallets!).length > 0
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

  if (!isIntendedStakeCredentialData(sections.intendedStakeCredential)) {
    errors.push(
      "state.intended_stake_credential must be None or Some with a 28-byte Cardano credential hash."
    );
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
        ? readWalletEntries(beneficiary.fields[1]!)
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
      "Recovery contacts need a proof of life before they can be used."
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
  const errors = validateStateDatum(stateDatum);
  let sections;
  try {
    sections = readStateSections(stateDatum, "Mint State datum");
  } catch {
    return errors;
  }

  if (
    !isConstrData(sections.lastNonAdminPayoutAt) ||
    sections.lastNonAdminPayoutAt.alternative !== 1 ||
    sections.lastNonAdminPayoutAt.fields.length !== 0
  ) {
    errors.push("A fresh wallet must start without a non-admin payout timestamp.");
  }
  sections.streamingPayments.forEach((streamingPayment, index) => {
    if (!isConstrData(streamingPayment) || streamingPayment.fields.length !== 8) {
      return;
    }
    const paidOutAmount = streamingPayment.fields[2];
    const startDate = streamingPayment.fields[6];
    const endDate = streamingPayment.fields[7];
    if (typeof paidOutAmount === "number" && paidOutAmount !== 0) {
      errors.push(
        `Fresh streaming payment ${index + 1} must start with zero already-paid amount.`
      );
    }
    if (
      typeof startDate === "number" &&
      typeof endDate === "number" &&
      startDate >= endDate
    ) {
      errors.push(
        `Fresh streaming payment ${index + 1} must start before it ends.`
      );
    }
  });

  return errors;
}

/**
 * ManageStreamingPayments may forward an existing zero-duration entry created
 * by receiver cancellation, but every brand-new id must still have positive
 * duration. Mirrors the fresh-add branch of the on-chain forwarding rule.
 */
export function validateFreshStreamingPayments(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData
): string[] {
  let inputSections;
  let outputSections;
  try {
    inputSections = readStateSections(inputStateDatum, "Input State datum");
    outputSections = readStateSections(outputStateDatum, "Output State datum");
  } catch {
    return [];
  }

  const inputIds = new Set(
    inputSections.streamingPayments.flatMap((payment) =>
      isConstrData(payment) && typeof payment.fields[0] === "number"
        ? [payment.fields[0]]
        : []
    )
  );
  const errors: string[] = [];
  outputSections.streamingPayments.forEach((payment, index) => {
    if (
      !isConstrData(payment) ||
      payment.fields.length !== 8 ||
      typeof payment.fields[0] !== "number" ||
      inputIds.has(payment.fields[0])
    ) {
      return;
    }
    const paidOutAmount = payment.fields[2];
    const startDate = payment.fields[6];
    const endDate = payment.fields[7];
    if (typeof paidOutAmount === "number" && paidOutAmount !== 0) {
      errors.push(
        `Fresh streaming payment ${index + 1} must start with zero already-paid amount.`
      );
    }
    if (
      typeof startDate === "number" &&
      typeof endDate === "number" &&
      startDate >= endDate
    ) {
      errors.push(
        `Fresh streaming payment ${index + 1} must start before it ends.`
      );
    }
  });
  return errors;
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

  const poweredKeyUsage = new Map<
    string,
    { userIndexes: number[]; combinedPower: number }
  >();
  for (const [userIndex, user] of sections.users.entries()) {
    const summary = readUserAccessSummary(user);
    if (!summary || summary.multiSigPower <= 0) {
      continue;
    }

    // Plutus ByteArray equality is case-insensitive with respect to the hex
    // text used off-chain. Normalize before counting so the same signer cannot
    // evade the duplicate-power warning as `AA...` versus `aa...`.
    for (const wallet of new Set(summary.wallets.map((value) => value.toLowerCase()))) {
      const usage = poweredKeyUsage.get(wallet) ?? { userIndexes: [], combinedPower: 0 };
      usage.userIndexes.push(userIndex);
      usage.combinedPower += summary.multiSigPower;
      poweredKeyUsage.set(wallet, usage);
    }
  }
  for (const [wallet, usage] of poweredKeyUsage.entries()) {
    if (usage.userIndexes.length < 2) {
      continue;
    }

    warnings.push(
      `Multisig key ${wallet} appears in powered owner records ${usage.userIndexes
        .map((index) => index + 1)
        .join(", ")}. One signature contributes their combined power ${usage.combinedPower}; the threshold does not require distinct people.`
    );
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
        ? readOptionIntegerValue(beneficiary.fields[2]!)
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
      "A recovery contact can already withdraw from this wallet now: the proof of life has lapsed. If that is not intended, renew it or set its unlock time in the future before continuing."
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

  // (3) A timer that protects nobody. `validateStateDatum` already REJECTS recovery contacts
  // without a timer, but the reverse passed silently: a user could arm the proof of life,
  // add no recovery contacts, and be told there were no issues. On-chain this is legal and
  // simply inert (with no beneficiary there is nothing the lapse can hand the wallet to),
  // so it is an advisory here rather than an error. It cannot be an error: the opposite rule
  // is already an error, and two hard rules pointing opposite ways would make both the timer
  // and the contacts impossible to add first.
  if (proofUnlock !== null && sections.beneficiaries.length === 0) {
    warnings.push(
      "The proof of life is on, but no recovery contact is named. Nobody can claim this wallet if it runs out, so right now it protects nothing. Add a recovery contact to make it work."
    );
  }

  return warnings;
}
