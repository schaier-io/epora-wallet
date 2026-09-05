// Mirrors persistent authority and value caps in `lib/constants.ak`. The validator is the
// source of truth. `constants-parity.test.ts` catches drift.
export const MAX_WALLET_INPUTS_PER_SPEND = 1;
export const MAX_TRANSACTION_SIGNATORIES = 10;
export const MAX_EXTRA_REQUIRED_SIGNER_KEY_HASHES =
  MAX_TRANSACTION_SIGNATORIES - 1;
export const MAX_GOVERNANCE_TRANSACTION_REDEEMERS = 2;
export const MAX_BOUNDED_WALLET_NATIVE_ASSETS = 5;
