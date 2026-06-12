import {
  deserializeAddress,
  mPubKeyAddress,
  mScriptAddress,
  pubKeyAddress,
  scriptAddress,
  serializeAddressObj
} from "@meshsdk/core";
import type { ConstrData } from "@/lib/types/contracts";
import { isConstrData } from "@/lib/contracts/state-layout";

// The app currently targets Cardano preprod (see `NETWORK` in
// `lib/mesh/transactions.ts` and `STT_CACHE_NETWORK` in `lib/stt-cache`).
// networkId 0 => testnet bech32 prefix (`addr_test...`); 1 => mainnet.
const PAYOUT_ADDRESS_NETWORK_ID = 0;

type CredentialParts = { hash: string; isScript: boolean };

// On-chain `Address` (Aiken `cardano/address.Address`), the type of
// `StreamingPayment.payout_address`:
//   Address          = Constr 0 [payment_credential, stake_credential]
//   Credential       = VerificationKey(hash) | Script(hash)   // Constr 0 | 1
//   stake_credential = Option<StakeCredential>                // Some=Constr 0 | None=Constr 1
//   StakeCredential  = Inline(Credential) | Pointer{...}       // Constr 0 | 1
// The contract compares it for structural equality against a transaction
// `output.address` (lib/wallet/rules.ak, lib/streaming_payments/transitions.ak),
// so it must be a real Address constructor — not a bech32 ByteArray.

/**
 * Encode a bech32 Cardano address into the on-chain `Address` Plutus datum
 * expected by `StreamingPayment.payout_address`. Mirrors the off-chain
 * reference in `add_subscription.mjs` (`mPubKeyAddress(...)`).
 *
 * Throws if `value` is empty or not a valid Cardano address — this is the
 * same fail-fast contract the other `serialize*` helpers use for bad input.
 */
export function encodePayoutAddressToData(value: string, label = "Payout address"): ConstrData {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be a bech32 Cardano address.`);
  }

  let deserialized: ReturnType<typeof deserializeAddress>;
  try {
    deserialized = deserializeAddress(trimmed);
  } catch {
    throw new Error(`${label} "${trimmed}" is not a valid Cardano address.`);
  }

  const paymentHash = deserialized.pubKeyHash || deserialized.scriptHash;
  if (!paymentHash) {
    throw new Error(`${label} "${trimmed}" must include a payment credential.`);
  }
  const paymentIsScript = deserialized.pubKeyHash.length === 0;

  const stakeHash =
    deserialized.stakeCredentialHash || deserialized.stakeScriptCredentialHash || undefined;
  const stakeIsScript =
    deserialized.stakeCredentialHash.length === 0 &&
    deserialized.stakeScriptCredentialHash.length > 0;

  return paymentIsScript
    ? mScriptAddress(paymentHash, stakeHash, stakeIsScript)
    : mPubKeyAddress(paymentHash, stakeHash, stakeIsScript);
}

// `intended_stake_credential: Option<Credential>` as stored in the STT State
// datum — Some = Constr 0 [Credential], None = Constr 1 []. Note this is a bare
// `Option<Credential>`, NOT an Address's `Option<StakeCredential>` (no `Inline`
// wrapper), so we read the Credential directly out of the `Some`.
function readIntendedStakeCredential(stakeOption: unknown): CredentialParts | null {
  if (
    !isConstrData(stakeOption) ||
    stakeOption.alternative !== 0 ||
    stakeOption.fields.length !== 1
  ) {
    return null;
  }
  return readCredentialParts(stakeOption.fields[0]);
}

/**
 * The wallet's canonical receive address: the spend-script payment credential
 * combined with the `intended_stake_credential` recorded in the STT State datum.
 *
 * When the datum credential is `None` (the current default for every wallet),
 * this is the enterprise address — byte-for-byte identical to
 * `resolveWalletSpendAddress`, so there is no behaviour change until a wallet
 * actually sets a stake credential. When it is `Some(credential)`, the result is
 * the base/staking address that funds should be received at. Returns `null` on a
 * malformed credential so callers can fall back to the enterprise address.
 */
export function composeWalletReceiveAddress(
  paymentScriptHash: string,
  intendedStakeCredential: unknown
): string | null {
  const stake = readIntendedStakeCredential(intendedStakeCredential);
  try {
    const address = scriptAddress(paymentScriptHash, stake?.hash, stake?.isScript);
    return serializeAddressObj(address, PAYOUT_ADDRESS_NETWORK_ID);
  } catch {
    return null;
  }
}

function readCredentialParts(value: unknown): CredentialParts | null {
  if (
    !isConstrData(value) ||
    value.fields.length !== 1 ||
    (value.alternative !== 0 && value.alternative !== 1)
  ) {
    return null;
  }

  const hash = value.fields[0];
  if (typeof hash !== "string" || hash.length === 0) {
    return null;
  }

  return { hash, isScript: value.alternative === 1 };
}

function readStakeCredentialParts(stakeOption: unknown): CredentialParts | null {
  // Some(StakeCredential); None (Constr 1) yields no stake part.
  if (!isConstrData(stakeOption) || stakeOption.alternative !== 0 || stakeOption.fields.length !== 1) {
    return null;
  }

  const stakeCredential = stakeOption.fields[0];
  // Inline(Credential); Pointer staking is not reconstructed for display.
  if (
    !isConstrData(stakeCredential) ||
    stakeCredential.alternative !== 0 ||
    stakeCredential.fields.length !== 1
  ) {
    return null;
  }

  return readCredentialParts(stakeCredential.fields[0]);
}

/**
 * True when `value` is a structurally valid on-chain `Address` constructor:
 * a Constr 0 with a Credential payment part and a `Some`/`None` stake option.
 */
export function isAddressData(value: unknown): value is ConstrData {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== 2) {
    return false;
  }

  if (readCredentialParts(value.fields[0]) === null) {
    return false;
  }

  const stakeOption = value.fields[1];
  if (!isConstrData(stakeOption)) {
    return false;
  }

  // None => no fields; Some => exactly one StakeCredential field.
  if (stakeOption.alternative === 1) {
    return stakeOption.fields.length === 0;
  }

  return stakeOption.alternative === 0 && stakeOption.fields.length === 1;
}

/**
 * Decode an on-chain `Address` Plutus datum back to a bech32 string for the
 * form. A plain string passes through unchanged (backward compatibility with
 * datums written before payout addresses were structured). Returns "" when the
 * value is absent or cannot be decoded to an address.
 */
export function decodePayoutAddressFromData(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!isAddressData(value)) {
    return "";
  }

  const payment = readCredentialParts(value.fields[0]);
  if (!payment) {
    return "";
  }

  const stake = readStakeCredentialParts(value.fields[1]);

  try {
    const address = payment.isScript
      ? scriptAddress(payment.hash, stake?.hash, stake?.isScript)
      : pubKeyAddress(payment.hash, stake?.hash, stake?.isScript);
    return serializeAddressObj(address, PAYOUT_ADDRESS_NETWORK_ID);
  } catch {
    return "";
  }
}
