// Phrasing wallets use when the user declines, cancels, or refuses a signature
// prompt. This is the user's own decision, not an application failure, so both
// consumers treat it as routine:
//   - the transaction-error explainer (workspace/helpers/build-errors.ts) turns
//     it into a calm sentence instead of a console diagnostic;
//   - the Sentry filter (lib/observability/sentry-scrub.ts) drops the event so
//     expected declines never page a maintainer.
//
// Matched against message text only, never error codes: wallets phrase the same
// decision many ways and a `DataSignError` with a different cause (a key
// problem, say) must stay a real error.
export const WALLET_REJECTION_PATTERNS: readonly RegExp[] = [
  /declined to sign/i,
  /refused to sign/i,
  /user declined/i,
  /user refused/i,
  /user rejected/i,
  /user cancel(?:l)?ed/i,
  /cancel(?:l)?ed by user/i,
  /signing cancel(?:l)?ed/i
];

/** Does this message read as the user having declined a wallet prompt? */
export function isWalletRejectionMessage(message: string): boolean {
  return WALLET_REJECTION_PATTERNS.some((pattern) => pattern.test(message));
}
