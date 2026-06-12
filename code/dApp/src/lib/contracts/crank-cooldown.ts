//// Off-chain mirror of the on-chain `PayStreamingPayment` cooldown BYPASS
//// predicate (ADR-0009). A permissionless crank advances
//// `last_permissionless_payout_at`; an AUTHORIZED crank (admin / multisig quorum
//// / unlocked beneficiary) bypasses the cooldown AND must leave that field
//// unchanged. The on-chain handler enforces this split, so the off-chain builder
//// must decide preserve-vs-stamp the SAME way the validator would — a
//// disagreement makes the crank tx fail (an authorized signer that stamps, or a
//// permissionless signer that preserves).

import type { Data } from "@meshsdk/common";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import type { ConstrData } from "@/lib/types/contracts";

function readByteArray(value: Data, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a byte-array string.`);
  }
  return value;
}

function readWallets(value: Data, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a list.`);
  }
  return value.map((entry, index) => readByteArray(entry, `${label}[${index}]`));
}

function readOptionalInteger(value: Data, label: string): number | null {
  if (!isConstrData(value)) {
    throw new Error(`${label} must be an Option constructor.`);
  }
  if (value.alternative === 1 && value.fields.length === 0) {
    return null;
  }
  if (value.alternative === 0 && value.fields.length === 1) {
    const inner = value.fields[0];
    if (typeof inner !== "number" || !Number.isSafeInteger(inner)) {
      throw new Error(`${label}.Some must be a safe integer.`);
    }
    return inner;
  }
  throw new Error(`${label} must be a valid Option constructor.`);
}

function readBoolean(value: Data, label: string): boolean {
  // Aiken/Plutus Bool: False = constructor 0, True = constructor 1.
  if (!isConstrData(value) || value.fields.length !== 0) {
    throw new Error(`${label} must be a Bool constructor.`);
  }
  if (value.alternative === 0) {
    return false;
  }
  if (value.alternative === 1) {
    return true;
  }
  throw new Error(`${label} must be a valid Bool constructor.`);
}

/**
 * True iff a `PayStreamingPayment` crank for which `signerKeyHash` is the (only)
 * required signer would take the on-chain BYPASS branch — and therefore must
 * PRESERVE `last_permissionless_payout_at` rather than stamp `Some(tx_latest)`.
 *
 * Mirrors `lib/stt/spend_handlers.eval_pay_streaming_payment` +
 * `lib/state/authorization.{has_operator_authority,has_unlocked_beneficiary_authority}`:
 * the key bypasses iff it is
 *   - an ADMIN user's wallet (a user with `is_admin` holding the key), OR
 *   - holds summed `multi_sig_power` (over every record carrying it, positive
 *     power only) >= a positive `multi_sig_threshold`, OR
 *   - an UNLOCKED beneficiary's wallet at `txEarliestTimeMs`:
 *     `proof_of_life.unlock_time` is set and
 *     `tx_earliest >= max(unlock_after ?? unlock_time, unlock_time)`.
 *
 * The off-chain crank declares exactly ONE required signer (the connected wallet,
 * via `setRequiredSigners([changeAddress])`), so `extra_signatories == [signerKeyHash]`
 * on-chain; the multisig sum is over the records holding THAT one key, matching
 * the validator. Beneficiary-wallet distinctness is guaranteed by config
 * validation at mint, so it is not re-checked here.
 *
 * Keep this in lockstep with the validator. If the contract's bypass logic
 * changes, this must change with it (covered by `crank-cooldown.test.ts`).
 */
export function crankSignerBypassesCooldown(
  stateDatum: ConstrData,
  signerKeyHash: string,
  txEarliestTimeMs: number
): boolean {
  const sections = readStateSections(
    unwrapStateDatum(stateDatum, "Crank cooldown state datum"),
    "Crank cooldown state datum"
  );

  const expectUser = (user: Data, index: number): ConstrData => {
    if (!isConstrData(user) || user.alternative !== 0 || user.fields.length !== 8) {
      throw new Error(`Crank cooldown state.users[${index}] must be a User constructor.`);
    }
    return user;
  };

  // Admin path: any `is_admin` user whose wallet is the signer.
  const isAdmin = sections.users.some((user, index) => {
    const parsed = expectUser(user, index);
    return (
      readBoolean(parsed.fields[7], `state.users[${index}].is_admin`) &&
      readWallets(parsed.fields[1], `state.users[${index}].user_wallets`).includes(
        signerKeyHash
      )
    );
  });
  if (isAdmin) {
    return true;
  }

  // Multisig path: summed power of the records the signer appears in (positive
  // power only) meets a positive threshold.
  const threshold = readOptionalInteger(
    sections.multiSigThreshold,
    "state.multi_sig_threshold"
  );
  if (threshold !== null && threshold > 0) {
    let signedPower = 0;
    sections.users.forEach((user, index) => {
      const parsed = expectUser(user, index);
      const power = readOptionalInteger(
        parsed.fields[6],
        `state.users[${index}].multi_sig_power`
      );
      if (
        power !== null &&
        power > 0 &&
        readWallets(parsed.fields[1], `state.users[${index}].user_wallets`).includes(
          signerKeyHash
        )
      ) {
        signedPower += power;
      }
    });
    if (signedPower >= threshold) {
      return true;
    }
  }

  // Unlocked-beneficiary path (recovery): no global unlock_time means no
  // beneficiary can unlock.
  const unlockTime = readOptionalInteger(
    sections.unlockTime,
    "state.proof_of_life.unlock_time"
  );
  if (unlockTime !== null) {
    const isUnlockedBeneficiary = sections.beneficiaries.some((beneficiary, index) => {
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
          beneficiary.fields[1],
          `state.beneficiaries[${index}].beneficiary_wallets`
        ).includes(signerKeyHash)
      ) {
        return false;
      }
      const unlockAfter = readOptionalInteger(
        beneficiary.fields[2],
        `state.beneficiaries[${index}].unlock_after`
      );
      const effectiveUnlock =
        unlockAfter !== null ? Math.max(unlockAfter, unlockTime) : unlockTime;
      return txEarliestTimeMs >= effectiveUnlock;
    });
    if (isUnlockedBeneficiary) {
      return true;
    }
  }

  return false;
}
