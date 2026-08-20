import type { PayeeStreamingPayment } from "@/components/payee/collect-payee-streaming-payments";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import { computeStreamingPaymentDueAmount } from "@/lib/user-flow/guided-helpers";

/**
 * The datum stores numbers; every shared streaming-payment helper reads the form shape, which
 * is strings. That conversion is the whole of this adapter, and it exists once so the payee's
 * page cannot drift from the payer's on either the figure owed or the payout it builds.
 */
export function toStreamingPaymentForm(
  payment: PayeeStreamingPayment
): StreamingPaymentFormState {
  return {
    id: String(payment.streamingPaymentId),
    payoutAddress: payment.payoutAddress,
    paidOutAmount: String(payment.paidOutAmount),
    policyId: payment.policyId,
    assetName: payment.assetName,
    amountPerDay: String(payment.amountPerDay),
    startDate: String(payment.startDate),
    endDate: String(payment.endDate)
  };
}

/**
 * What this payee has earned and not yet been paid.
 *
 * `computeStreamingPaymentDueAmount` already existed, with exactly one non-test caller: the
 * payer's workspace. So the person sending the money could see what was owed, and the person
 * owed it could not — their page showed the daily rate and the running total and left the
 * subtraction to them. This routes the payee's page through the same function rather than a
 * second implementation, so the two sides cannot disagree about a figure that is someone's
 * income.
 */
export function computePayeeDueAmount(
  payment: PayeeStreamingPayment,
  nowMs: number
): string {
  return computeStreamingPaymentDueAmount(toStreamingPaymentForm(payment), nowMs);
}
