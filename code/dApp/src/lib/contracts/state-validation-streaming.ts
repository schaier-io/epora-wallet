import type { ConstrData } from "@/lib/types/contracts";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import {
  readOption,
  validateInteger
} from "@/lib/contracts/state-validation-records";
import { validateCurrentStateDatum } from "@/lib/contracts/state-validation";
import { addressUsesPaymentScriptHash } from "@/lib/contracts/payout-address";
import { isOnChainInteger } from "@/lib/contracts/on-chain-integer";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsStateValidation.json";

const i18n = createDefaultTranslator("LibContractsStateValidation", defaultMessages);

function validateFreshStreamingPaymentBoundary(
  streamingPayment: ConstrData,
  index: number,
  walletPaymentScriptHash: string | undefined,
  sttPolicyId: string | undefined,
  errors: string[]
) {
  if (
    walletPaymentScriptHash &&
    addressUsesPaymentScriptHash(
      streamingPayment.fields[1],
      walletPaymentScriptHash
    )
  ) {
    errors.push(
      i18n("freshStreamingPaymentValue1CannotUseThisWallet", {
        value1: index + 1
      })
    );
  }

  const paymentPolicyId = streamingPayment.fields[3];
  const normalizedSttPolicyId = sttPolicyId?.trim().toLowerCase() ?? "";
  if (
    normalizedSttPolicyId &&
    typeof paymentPolicyId === "string" &&
    paymentPolicyId.trim().toLowerCase() === normalizedSttPolicyId
  ) {
    errors.push(
      i18n("freshStreamingPaymentValue1CannotUseThisWalletPolicy", {
        value1: index + 1
      })
    );
  }
}

export function validateMintStateDatum(
  stateDatum: ConstrData,
  walletPaymentScriptHash?: string,
  sttPolicyId?: string
): string[] {
  const errors = validateCurrentStateDatum(stateDatum);
  let sections;
  try {
    sections = readStateSections(stateDatum, "Mint State datum");
  } catch {
    return errors;
  }

  // Some(0) is legal in a forwarded datum, but no co-signer set can satisfy it.
  // Only mint rejects that fresh configuration.
  const threshold = readOption(
    sections.multiSigThreshold,
    "state.multi_sig_threshold",
    []
  );
  if (threshold?.kind === "some") {
    validateInteger(
      threshold.value,
      "state.multi_sig_threshold.Some",
      errors,
      { min: 1 }
    );
  }

  if (
    !isConstrData(sections.lastNonAdminPayoutAt) ||
    sections.lastNonAdminPayoutAt.alternative !== 1 ||
    sections.lastNonAdminPayoutAt.fields.length !== 0
  ) {
    errors.push(i18n("aFreshWalletMustStartWithoutANon"));
  }
  sections.streamingPayments.forEach((streamingPayment, index) => {
    if (!isConstrData(streamingPayment) || streamingPayment.fields.length !== 8) {
      return;
    }
    const paidOutAmount = streamingPayment.fields[2];
    const startDate = streamingPayment.fields[6];
    const endDate = streamingPayment.fields[7];
    if (isOnChainInteger(paidOutAmount) && BigInt(paidOutAmount) !== 0n) {
      errors.push(
        i18n("freshStreamingPaymentValue1MustStartWithZero", {
          value1: index + 1
        })
      );
    }
    if (
      isOnChainInteger(startDate) &&
      isOnChainInteger(endDate) &&
      BigInt(startDate) >= BigInt(endDate)
    ) {
      errors.push(
        i18n("freshStreamingPaymentValue1MustStartBeforeIt", {
          value1: index + 1
        })
      );
    }
    validateFreshStreamingPaymentBoundary(
      streamingPayment,
      index,
      walletPaymentScriptHash,
      sttPolicyId,
      errors
    );
  });

  return errors;
}

/**
 * ManageStreamingPayments may forward an existing zero-duration entry created
 * by receiver cancellation, but every brand-new id must still have positive
 * duration. A wallet-credential destination is rejected only for a new id, so
 * these fresh-only checks do not block forwarding or rescheduling an existing id.
 */
export function validateFreshStreamingPayments(
  inputStateDatum: ConstrData,
  outputStateDatum: ConstrData,
  walletPaymentScriptHash?: string,
  sttPolicyId?: string
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
      isConstrData(payment) && isOnChainInteger(payment.fields[0])
        ? [BigInt(payment.fields[0])]
        : []
    )
  );
  const errors: string[] = [];
  outputSections.streamingPayments.forEach((payment, index) => {
    if (
      !isConstrData(payment) ||
      payment.fields.length !== 8 ||
      !isOnChainInteger(payment.fields[0]) ||
      inputIds.has(BigInt(payment.fields[0]))
    ) {
      return;
    }
    const paidOutAmount = payment.fields[2];
    const startDate = payment.fields[6];
    const endDate = payment.fields[7];
    if (isOnChainInteger(paidOutAmount) && BigInt(paidOutAmount) !== 0n) {
      errors.push(
        i18n("freshStreamingPaymentValue1MustStartWithZero", {
          value1: index + 1
        })
      );
    }
    if (
      isOnChainInteger(startDate) &&
      isOnChainInteger(endDate) &&
      BigInt(startDate) >= BigInt(endDate)
    ) {
      errors.push(
        i18n("freshStreamingPaymentValue1MustStartBeforeIt", {
          value1: index + 1
        })
      );
    }
    validateFreshStreamingPaymentBoundary(
      payment,
      index,
      walletPaymentScriptHash,
      sttPolicyId,
      errors
    );
  });
  return errors;
}
