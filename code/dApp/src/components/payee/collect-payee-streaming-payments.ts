//// Pure extraction of the streaming payments a connected wallet is the PAYEE of,
//// across every detected STT wallet. No Mesh/React/browser dependency, so it is
//// unit-testable. The payee match mirrors the on-chain
//// `has_streaming_payment_payee_authority`: only a VerificationKey payout address
//// whose hash equals the connected wallet's payment key hash qualifies (a
//// Script-credential payee cannot sign, so it is excluded here too).

import type { DetectedSttToken } from "@/lib/mesh/detection";
import { isConstrData, readStateSections } from "@/lib/contracts/state-layout";
import { readOptionalInteger } from "@/lib/contracts/plutus-primitives";
import { decodePayoutAddressFromData } from "@/lib/contracts/payout-address";
import {
  decodeWalletNameFromDatum,
  normalizeWalletName
} from "@/lib/contracts/state-wallet-name";

// StreamingPayment constructor field layout (on-chain record order: id,
// payout_address, paid_out_amount, policy_id, asset_name, amount_per_day,
// start_date, end_date).
const STREAMING_PAYMENT_FIELD_COUNT = 8;
const CREDENTIAL_HASH_HEX_LENGTH = 56;

function isCredentialHash(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === CREDENTIAL_HASH_HEX_LENGTH &&
    /^[0-9a-fA-F]+$/.test(value)
  );
}

export type PayeeStreamingPayment = {
  streamingPaymentId: number;
  policyId: string;
  assetName: string;
  amountPerDay: number;
  startDate: number;
  endDate: number;
  paidOutAmount: number;
  // Who is paying. Read from the containing State and previously discarded, which left the
  // payee with an invoice they could not attribute to anyone.
  payerWalletName: string;
  // Where the money must land, decoded from the datum rather than taken from the connected
  // wallet: the on-chain payout output has to match `payout_address` exactly, and one payment
  // key can appear under several addresses.
  payoutAddress: string;
  // Shared receiver/crank cadence clock from the containing State.
  lastNonAdminPayoutAt: number | null;
  // The STT UTxO this payment lives in. The tx builder spends it to cancel.
  sttInputTxHash: string;
  sttInputOutputIndex: number;
  sttPolicyId: string;
  sttAssetNameHex: string;
};

/**
 * What one scan saw, not just what it found.
 *
 * The page used to render a single "none found" line for five different outcomes: no wallets
 * on the network, wallets whose datum would not parse, malformed entries, streams paying a
 * Script credential (excluded by design, since there is no signature path), and the honest
 * case of having no payments. Being told "you have none" when the truth is "we could not
 * look" is the difference between waiting patiently and chasing an invoice.
 *
 * Script-credential payees are deliberately not counted here. The collector cannot tell one
 * that belongs to this user from the many that belong to other people's wallets, so a count
 * would be noise. A connected wallet that is itself a script has no payment key hash, and the
 * page catches that earlier.
 */
export type PayeeScanResult = {
  payments: PayeeStreamingPayment[];
  /** Every detected STT wallet this scan looked at. */
  walletsScanned: number;
  /** Wallets with no datum, or whose State would not parse. Their streams are invisible. */
  walletsUnreadable: number;
  /** Streaming-payment entries inside a readable wallet that did not match the datum shape. */
  entriesSkipped: number;
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
  // VerificationKey = alt 0; Script = alt 1 (excluded, no signature path).
  if (credential.alternative !== 0) {
    return null;
  }
  const hash = credential.fields[0];
  return isCredentialHash(hash) ? hash : null;
}

function readInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function readBytes(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Collect every streaming payment, across all detected STT wallets, whose payout
 * address is the VerificationKey of `paymentKeyHash`, that is, the streams the
 * connected wallet receives and may self-cancel. Malformed entries are skipped,
 * not thrown, so one bad wallet never hides the rest.
 */
export function collectPayeeStreamingPayments(
  tokens: DetectedSttToken[],
  paymentKeyHash: string
): PayeeScanResult {
  if (!paymentKeyHash) {
    return { payments: [], walletsScanned: tokens.length, walletsUnreadable: 0, entriesSkipped: 0 };
  }

  const collected: PayeeStreamingPayment[] = [];
  let walletsUnreadable = 0;
  let entriesSkipped = 0;

  for (const token of tokens) {
    if (!token.datum) {
      walletsUnreadable += 1;
      continue;
    }

    let streamingPayments;
    let lastNonAdminPayoutAt: number | null;
    let payerWalletName: string;
    try {
      const sections = readStateSections(token.datum);
      streamingPayments = sections.streamingPayments;
      lastNonAdminPayoutAt = readOptionalInteger(
        sections.lastNonAdminPayoutAt,
        "state.last_non_admin_payout_at"
      );
      payerWalletName = normalizeWalletName(decodeWalletNameFromDatum(sections.walletName));
    } catch {
      walletsUnreadable += 1;
      continue;
    }

    streamingPayments.forEach((entry) => {
      if (!isConstrData(entry) || entry.fields.length !== STREAMING_PAYMENT_FIELD_COUNT) {
        entriesSkipped += 1;
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
        entriesSkipped += 1;
        return;
      }

      const payoutAddress = decodePayoutAddressFromData(entry.fields[1]);
      if (!payoutAddress) {
        entriesSkipped += 1;
        return;
      }

      collected.push({
        streamingPaymentId,
        payerWalletName,
        payoutAddress,
        policyId,
        assetName,
        amountPerDay,
        startDate,
        endDate,
        paidOutAmount,
        lastNonAdminPayoutAt,
        sttInputTxHash: token.utxo.input.txHash,
        sttInputOutputIndex: token.utxo.input.outputIndex,
        sttPolicyId: token.policyId,
        sttAssetNameHex: token.assetNameHex
      });
    });
  }

  return {
    payments: collected,
    walletsScanned: tokens.length,
    walletsUnreadable,
    entriesSkipped
  };
}
