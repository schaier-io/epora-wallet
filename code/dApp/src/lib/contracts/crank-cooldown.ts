//// Off-chain mirror of the two on-chain `PayStreamingPayment` gates
//// (whitepaper: Settlement-cadence theorem).
////
//// 1. AUTHORITY: the crank is NOT permissionless. It must be signed by an
////    admin, a multisig quorum, ANY listed user, ANY stream payee ("receiver"),
////    or an unlocked beneficiary. `crankSignerIsAuthorized` mirrors that gate so
////    the builder can refuse a doomed transaction up front.
//// 2. CADENCE: only an ADMIN bypasses the 30-minute limit, and an admin crank
////    must LEAVE `last_non_admin_payout_at` unchanged. Every other authorized
////    cranker must STAMP it with the tx upper bound.
////
//// The on-chain handler enforces the preserve-vs-stamp split, so the off-chain
//// builder must decide it the SAME way the validator would, because a disagreement makes
//// the crank tx fail (an admin that stamps, or a non-admin that preserves).

import type { Data } from "@meshsdk/common";
import {
  isConstrData,
  readBoolean,
  readOptionalInteger,
  readWallets
} from "@/lib/contracts/plutus-primitives";
import { readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import type { ConstrData } from "@/lib/types/contracts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsCrankCooldown.json";

const i18n = createDefaultTranslator("LibContractsCrankCooldown", defaultMessages);

// Shared by every non-admin payout crank and receiver cancellation. These mirror
// `constants.non_admin_payout_cooldown_ms` and
// `constants.max_payout_validity_window_ms` on-chain.
export const NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS = 1_800_000;
export const MAX_NON_ADMIN_STREAMING_ACTION_VALIDITY_WINDOW_MS = 3_600_000;

export function nonAdminStreamingActionCooldownRemainingMs(
  lastNonAdminPayoutAt: number | null,
  txEarliestTimeMs: number
): number {
  if (!Number.isSafeInteger(txEarliestTimeMs) || txEarliestTimeMs < 0) {
    throw new Error(i18n("lowerBoundMustBeNonNegativeSafeInteger"));
  }
  if (lastNonAdminPayoutAt === null) {
    return 0;
  }
  if (!Number.isSafeInteger(lastNonAdminPayoutAt) || lastNonAdminPayoutAt < 0) {
    throw new Error(i18n("lastPayoutMustBeNonNegativeSafeInteger"));
  }
  return Math.max(
    0,
    lastNonAdminPayoutAt + NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS - txEarliestTimeMs
  );
}

export function readLastNonAdminPayoutAt(stateDatum: ConstrData): number | null {
  return readOptionalInteger(
    readCrankSections(stateDatum).lastNonAdminPayoutAt,
    "state.last_non_admin_payout_at"
  );
}

/** Fail fast with the same finite-window and shared-cadence rules as on-chain. */
export function assertNonAdminStreamingActionWindow(
  stateDatum: ConstrData,
  txEarliestTimeMs: number,
  txLatestTimeMs: number,
  label: string
): void {
  if (
    !Number.isSafeInteger(txEarliestTimeMs) ||
    !Number.isSafeInteger(txLatestTimeMs) ||
    txEarliestTimeMs < 0 ||
    txLatestTimeMs < txEarliestTimeMs
  ) {
    throw new Error(i18n("labelRequiresFiniteValidityWindow", { label }));
  }
  if (
    txLatestTimeMs - txEarliestTimeMs >
    MAX_NON_ADMIN_STREAMING_ACTION_VALIDITY_WINDOW_MS
  ) {
    throw new Error(i18n("labelValidityWindowTooLong", { label }));
  }

  const remainingMs = nonAdminStreamingActionCooldownRemainingMs(
    readLastNonAdminPayoutAt(stateDatum),
    txEarliestTimeMs
  );
  if (remainingMs > 0) {
    const remainingMinutes = Math.ceil(remainingMs / 60_000);
    throw new Error(i18n("labelStillInCooldown", { label, count: remainingMinutes }));
  }
}

// Plutus-Data readers (readByteArray/readWallets/readOptionalInteger/readBoolean)
// and the isConstrData guard are imported from @/lib/contracts/plutus-primitives.

/**
 * True iff a `PayStreamingPayment` crank for which `signerKeyHash` is the (only)
 * required signer takes the on-chain CADENCE-BYPASS branch, and therefore must
 * PRESERVE `last_non_admin_payout_at` rather than stamp `Some(tx_latest)`.
 *
 * Mirrors `lib/stt/settlement_handlers.crank_authority_and_cooldown_ok`: ONLY an
 * ADMIN bypasses. A multisig quorum, a listed user, a stream payee and an unlocked
 * beneficiary are all authorized to crank (see `crankSignerIsAuthorized`) but are
 * all rate-limited and must stamp the clock.
 *
 * (Before the 2026-07 security review the crank was permissionless and multisig /
 * unlocked-beneficiary signatures also bypassed. Both changed: `false` here no
 * longer implies "no signature required".)
 *
 * The off-chain crank declares exactly ONE required signer (the connected wallet,
 * via `setRequiredSigners([changeAddress])`), so `extra_signatories == [signerKeyHash]`
 * on-chain.
 *
 * Keep this in lockstep with the validator. If the contract's bypass logic
 * changes, this must change with it (covered by `crank-cooldown.test.ts`).
 */
export function crankSignerBypassesCooldown(
  stateDatum: ConstrData,
  signerKeyHash: string,
  txEarliestTimeMs: number
): boolean {
  return crankSignersBypassCooldown(stateDatum, [signerKeyHash], txEarliestTimeMs);
}

/**
 * Set form of `crankSignerBypassesCooldown` for a crank whose body lists several
 * required signers (an approval request with co-signers): the validator takes the
 * admin branch as soon as ANY listed admin signed, so the stamp must be preserved
 * whenever one is in the set.
 */
export function crankSignersBypassCooldown(
  stateDatum: ConstrData,
  signerKeyHashes: readonly string[],
  txEarliestTimeMs: number
): boolean {
  void txEarliestTimeMs;
  const sections = readCrankSections(stateDatum);
  return signerKeyHashes.some((keyHash) => signerIsAdmin(sections, keyHash));
}

/**
 * True iff `signerKeyHash` clears the on-chain AUTHORITY gate for a
 * `PayStreamingPayment` crank; that is, the transaction will not be rejected simply
 * for who signed it. Mirrors the `or` in
 * `lib/stt/settlement_handlers.crank_authority_and_cooldown_ok`:
 *   - an ADMIN user's wallet, OR
 *   - summed `multi_sig_power` (positive-power records only) >= a positive
 *     `multi_sig_threshold`, OR
 *   - ANY listed user's wallet, whatever their role, OR
 *   - the payment key of ANY stream's `payout_address` ("receiver"), OR
 *   - an UNLOCKED beneficiary's wallet at `txEarliestTimeMs`.
 *
 * Cadence is a SEPARATE gate: clearing this does not mean the crank may land now
 * (see `crankSignerBypassesCooldown` and the 30-minute limit).
 */
export function crankSignerIsAuthorized(
  stateDatum: ConstrData,
  signerKeyHash: string,
  txEarliestTimeMs: number
): boolean {
  return crankSignersAreAuthorized(stateDatum, [signerKeyHash], txEarliestTimeMs);
}

/**
 * Set form of `crankSignerIsAuthorized`: the body's required signers together.
 * Any one of them clearing a single-signer gate is enough, and the multisig
 * quorum sums the power of every listed user, as `extra_signatories` does.
 */
export function crankSignersAreAuthorized(
  stateDatum: ConstrData,
  signerKeyHashes: readonly string[],
  txEarliestTimeMs: number
): boolean {
  const sections = readCrankSections(stateDatum);
  return (
    signersMeetMultisigThreshold(sections, signerKeyHashes) ||
    signerKeyHashes.some(
      (keyHash) =>
        signerIsAdmin(sections, keyHash) ||
        signerIsListedUser(sections, keyHash) ||
        signerIsStreamPayee(sections, keyHash) ||
        signerIsUnlockedBeneficiary(sections, keyHash, txEarliestTimeMs)
    )
  );
}

// --- shared readers -------------------------------------------------------

function readCrankSections(stateDatum: ConstrData) {
  return readStateSections(
    unwrapStateDatum(stateDatum, "Crank cooldown state datum"),
    "Crank cooldown state datum"
  );
}

function expectUser(user: Data, index: number): ConstrData {
  if (!isConstrData(user) || user.alternative !== 0 || user.fields.length !== 8) {
    throw new Error(`Crank cooldown state.users[${index}] must be a User constructor.`);
  }
  return user;
}

function userWallets(user: Data, index: number): string[] {
  return readWallets(
    expectUser(user, index).fields[1]!,
    `state.users[${index}].user_wallets`
  );
}

type CrankSections = ReturnType<typeof readCrankSections>;

function signerIsAdmin(sections: CrankSections, signerKeyHash: string): boolean {
  return sections.users.some((user, index) => {
    const parsed = expectUser(user, index);
    return (
      readBoolean(parsed.fields[7]!, `state.users[${index}].is_admin`) &&
      userWallets(user, index).includes(signerKeyHash)
    );
  });
}

function signerIsListedUser(sections: CrankSections, signerKeyHash: string): boolean {
  return sections.users.some((user, index) =>
    userWallets(user, index).includes(signerKeyHash)
  );
}

function signersMeetMultisigThreshold(
  sections: CrankSections,
  signerKeyHashes: readonly string[]
): boolean {
  const threshold = readOptionalInteger(
    sections.multiSigThreshold,
    "state.multi_sig_threshold"
  );
  if (threshold === null || threshold <= 0) {
    return false;
  }
  let signedPower = 0;
  sections.users.forEach((user, index) => {
    const power = readOptionalInteger(
      expectUser(user, index).fields[6]!,
      `state.users[${index}].multi_sig_power`
    );
    const wallets = userWallets(user, index);
    if (power !== null && power > 0 && signerKeyHashes.some((keyHash) => wallets.includes(keyHash))) {
      signedPower += power;
    }
  });
  return signedPower >= threshold;
}

// A stream's `payout_address` is an Address constructor whose first field is the
// payment Credential; a VerificationKey credential holds the key hash. A Script
// credential cannot sign, so it never matches (mirroring
// `authorization.has_streaming_payment_payee_authority`).
function signerIsStreamPayee(
  sections: CrankSections,
  signerKeyHash: string
): boolean {
  return sections.streamingPayments.some((payment, index) => {
    if (!isConstrData(payment) || payment.fields.length !== 8) {
      throw new Error(
        `Crank cooldown state.streaming_payments[${index}] must be a StreamingPayment constructor.`
      );
    }
    const address = payment.fields[1]!;
    if (!isConstrData(address) || address.fields.length < 1) {
      return false;
    }
    const credential = address.fields[0]!;
    if (!isConstrData(credential) || credential.alternative !== 0) {
      // alternative 1 == Script credential: cannot produce a signature.
      return false;
    }
    const keyHash = credential.fields[0];
    return typeof keyHash === "string" && keyHash === signerKeyHash;
  });
}

function signerIsUnlockedBeneficiary(
  sections: CrankSections,
  signerKeyHash: string,
  txEarliestTimeMs: number
): boolean {
  const unlockTime = readOptionalInteger(
    sections.unlockTime,
    "state.proof_of_life.unlock_time"
  );
  if (unlockTime === null) {
    return false;
  }
  return sections.beneficiaries.some((beneficiary, index) => {
    if (
      !isConstrData(beneficiary) ||
      beneficiary.alternative !== 0 ||
      beneficiary.fields.length !== 4
    ) {
      throw new Error(
        `Crank cooldown state.beneficiaries[${index}] must be a Beneficiary constructor.`
      );
    }
    if (
      !readWallets(
        beneficiary.fields[1]!,
        `state.beneficiaries[${index}].beneficiary_wallets`
      ).includes(signerKeyHash)
    ) {
      return false;
    }
    const unlockAfter = readOptionalInteger(
      beneficiary.fields[2]!,
      `state.beneficiaries[${index}].unlock_after`
    );
    const effectiveUnlock =
      unlockAfter !== null ? Math.max(unlockAfter, unlockTime) : unlockTime;
    return txEarliestTimeMs >= effectiveUnlock;
  });
}
