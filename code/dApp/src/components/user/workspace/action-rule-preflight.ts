import type { StateFormState } from "@/lib/contracts/state-form";
import {
  assertNonAdminStreamingActionWindow,
  crankSignersAreAuthorized,
  crankSignersBypassCooldown
} from "@/lib/contracts/crank-cooldown";
import type { ConstrData, OperatorAuthorityPath } from "@/lib/types/contracts";
import { formatTimestampLabel } from "@/components/user/workspace/helpers/formatters";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceActionRulePreflight.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceActionRulePreflight", defaultMessages);

function normalizedKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function positiveInteger(value: string, enabled: boolean): bigint | null {
  const normalized = value.trim();
  if (!enabled || !/^\d+$/.test(normalized)) {
    return null;
  }
  const parsed = BigInt(normalized);
  return parsed > 0n ? parsed : null;
}

function optionalTimestamp(mode: "none" | "some", value: string): number | null {
  if (mode !== "some" || !/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Mirrors the operator gate before the transaction builder runs. */
export function getOperatorRuleError(
  state: StateFormState,
  signerKeyHash: string | null,
  path: OperatorAuthorityPath
): string | null {
  const signer = normalizedKey(signerKeyHash);
  if (!signer) {
    return i18n("connectAWalletBeforeYouContinue");
  }

  if (path === "admin") {
    const isOwner = state.users.some(
      (user) =>
        user.isAdmin && user.wallets.some((wallet) => normalizedKey(wallet) === signer)
    );
    return isOwner ? null : i18n("connectedWalletIsNotAnOwner");
  }

  const threshold = positiveInteger(
    state.multiSigThreshold,
    state.multiSigThresholdMode === "some"
  );
  if (threshold === null) {
    return i18n("coSignerThresholdIsNotActive");
  }

  const powerHolders = state.users.flatMap((user) => {
    const power = positiveInteger(user.multiSigPower, user.multiSigPowerMode === "some");
    return power === null ? [] : [{ wallets: user.wallets, power }];
  });
  const signerHasPower = powerHolders.some((user) =>
    user.wallets.some((wallet) => normalizedKey(wallet) === signer)
  );
  if (!signerHasPower) {
    return i18n("connectedWalletIsNotACoSigner");
  }

  const availablePower = powerHolders.reduce((total, user) => total + user.power, 0n);
  return availablePower >= threshold ? null : i18n("coSignerThresholdCannotBeMet");
}

/** Mirrors the beneficiary signature and time gates from state/authorization.ak. */
export function getBeneficiaryRuleError(
  state: StateFormState,
  signerKeyHash: string | null,
  txEarliestTimeMs: number
): string | null {
  const signer = normalizedKey(signerKeyHash);
  if (!signer) {
    return i18n("connectAWalletBeforeYouContinue");
  }

  const matches = state.beneficiaries.filter((beneficiary) =>
    beneficiary.wallets.some((wallet) => normalizedKey(wallet) === signer)
  );
  if (matches.length !== 1) {
    return i18n("connectedWalletIsNotARecoveryContact");
  }

  const proofOfLifeUnlock = optionalTimestamp(
    state.proofOfLifeUnlockTimeMode,
    state.proofOfLifeUnlockTime
  );
  if (proofOfLifeUnlock === null) {
    return i18n("recoveryHasNoProofOfLifeDeadline");
  }

  const beneficiary = matches[0]!;
  const personalUnlock = optionalTimestamp(
    beneficiary.unlockAfterMode,
    beneficiary.unlockAfter
  );
  const effectiveUnlock = Math.max(proofOfLifeUnlock, personalUnlock ?? 0);
  if (txEarliestTimeMs < effectiveUnlock) {
    return i18n("recoveryOpensAt", {
      value: formatTimestampLabel(effectiveUnlock)
    });
  }

  return null;
}

/** Mirrors scheduled-payment authority and cadence checks before Preview. */
export function getStreamingPayoutRuleError(input: {
  stateDatum: ConstrData;
  signerKeyHashes: readonly string[];
  txEarliestTimeMs: number;
  txLatestTimeMs: number;
}): string | null {
  const signerKeyHashes = input.signerKeyHashes
    .map(normalizedKey)
    .filter((keyHash) => keyHash.length > 0);
  if (signerKeyHashes.length === 0) {
    return i18n("connectAWalletBeforeYouContinue");
  }

  let authorized: boolean;
  let bypassesCooldown: boolean;
  try {
    authorized = crankSignersAreAuthorized(
      input.stateDatum,
      signerKeyHashes,
      input.txEarliestTimeMs
    );
    bypassesCooldown = crankSignersBypassCooldown(
      input.stateDatum,
      signerKeyHashes,
      input.txEarliestTimeMs
    );
  } catch {
    return i18n("walletRulesCouldNotBeChecked");
  }

  if (!authorized) {
    return i18n("connectedWalletCannotPayScheduledPayments");
  }
  if (bypassesCooldown) {
    return null;
  }

  try {
    assertNonAdminStreamingActionWindow(
      input.stateDatum,
      input.txEarliestTimeMs,
      input.txLatestTimeMs,
      i18n("scheduledPaymentPayout")
    );
  } catch (error) {
    return error instanceof Error
      ? error.message
      : i18n("walletRulesCouldNotBeChecked");
  }

  return null;
}
