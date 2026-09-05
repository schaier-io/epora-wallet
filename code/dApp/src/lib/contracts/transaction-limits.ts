// Mirrors transaction-work caps in `lib/constants.ak`. The validator is the
// source of truth. `constants-parity.test.ts` catches drift.
export const MAX_WALLET_INPUTS_PER_SPEND = 1;
export const MAX_WALLET_INPUTS_PER_CONSOLIDATION = 2;
export const MAX_STREAMING_PAYOUTS_PER_TRANSACTION = 2;
export const MAX_TRANSACTION_INPUTS = 4;
export const MAX_TRANSACTION_OUTPUTS = 4;
export const MAX_TRANSACTION_SIGNATORIES = 10;
export const MAX_EXTRA_REQUIRED_SIGNER_KEY_HASHES =
  MAX_TRANSACTION_SIGNATORIES - 1;
export const MAX_TRANSACTION_REDEEMERS = 3;
export const MAX_GOVERNANCE_TRANSACTION_REDEEMERS = 2;
export const MAX_BOUNDED_WALLET_NATIVE_ASSETS = 5;
