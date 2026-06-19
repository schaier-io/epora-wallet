//// Pure extraction of the streaming payments a connected wallet is the PAYEE of,
//// across every detected STT wallet. No Mesh/React/browser dependency, so it is
//// unit-testable. The payee match mirrors the on-chain
//// `has_streaming_payment_payee_authority`: only a VerificationKey payout address
//// whose hash equals the connected wallet's payment key hash qualifies (a
//// Script-credential payee cannot sign, so it is excluded here too).

import type { DetectedSttToken } from "@/lib/mesh/detection";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";

// StreamingPayment constructor field layout (on-chain record order: id,
// payout_address, paid_out_amount, policy_id, asset_name, amount_per_day,
// start_date, end_date).
const STREAMING_PAYMENT_FIELD_COUNT = 8;

export type PayeeStreamingPayment = {
  streamingPaymentId: number;
  policyId: string;
  assetName: string;
  amountPerDay: number;
  startDate: number;
  endDate: number;
  paidOutAmount: number;
  // The STT UTxO this payment lives in — the tx builder spends it to cancel.
  sttInputTxHash: string;
  sttInputOutputIndex: number;
  sttPolicyId: string;
  sttAssetNameHex: string;
};

// Read the VerificationKey payment key hash from an on-chain `Address` datum, or
// null when the address is malformed or uses a Script credential.
function readVerificationKeyHash(payoutAddress: unknown): string | null {
  if (
    !isConstrData(payoutAddress) ||
    payoutAddress.alternative !== 0 ||
    payoutAddress.fields.length !== 2
  ) {
    return null;
  }
  const credential = payoutAddress.fields[0];
  if (!isConstrData(credential) || credential.fields.length !== 1) {
    return null;
  }
  // VerificationKey = alt 0; Script = alt 1 (excluded — no signature path).
  if (credential.alternative !== 0) {
    return null;
  }
  const hash = credential.fields[0];
  return typeof hash === "string" && hash.length > 0 ? hash : null;
}

function readInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function readBytes(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Collect every streaming payment, across all detected STT wallets, whose payout
 * address is the VerificationKey of `paymentKeyHash` — i.e. the streams the
 * connected wallet receives and may self-cancel. Malformed entries are skipped,
 * not thrown, so one bad wallet never hides the rest.
 */
export function collectPayeeStreamingPayments(
  tokens: DetectedSttToken[],
  paymentKeyHash: string
): PayeeStreamingPayment[] {
  if (!paymentKeyHash) {
    return [];
  }

  const collected: PayeeStreamingPayment[] = [];

  for (const token of tokens) {
    if (!token.datum) {
      continue;
    }

    let streamingPayments;
    try {
      streamingPayments = readStateSections(token.datum).streamingPayments;
    } catch {
      continue;
    }

    streamingPayments.forEach((entry) => {
      if (!isConstrData(entry) || entry.fields.length !== STREAMING_PAYMENT_FIELD_COUNT) {
        return;
      }
      if (readVerificationKeyHash(entry.fields[1]) !== paymentKeyHash) {
        return;
      }

      const streamingPaymentId = readInt(entry.fields[0]);
      const paidOutAmount = readInt(entry.fields[2]);
      const policyId = readBytes(entry.fields[3]);
      const assetName = readBytes(entry.fields[4]);
      const amountPerDay = readInt(entry.fields[5]);
      const startDate = readInt(entry.fields[6]);
      const endDate = readInt(entry.fields[7]);
      if (
        streamingPaymentId === null ||
        paidOutAmount === null ||
        policyId === null ||
        assetName === null ||
        amountPerDay === null ||
        startDate === null ||
        endDate === null
      ) {
        return;
      }

      collected.push({
        streamingPaymentId,
        policyId,
        assetName,
        amountPerDay,
        startDate,
        endDate,
        paidOutAmount,
        sttInputTxHash: token.utxo.input.txHash,
        sttInputOutputIndex: token.utxo.input.outputIndex,
        sttPolicyId: token.policyId,
        sttAssetNameHex: token.assetNameHex
      });
    });
  }

  return collected;
}
