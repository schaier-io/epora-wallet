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
import { CARDANO_NETWORK, type CardanoNetwork } from "@/lib/cardano-network";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsPayoutAddress.json";

const i18n = createDefaultTranslator("LibContractsPayoutAddress", defaultMessages);

// The network this file serializes and validates addresses for, derived from the app's
// single network constant. networkId 0 => testnet bech32 prefix (`addr_test...`);
// 1 => mainnet. See also `NETWORK` in `lib/mesh/transactions.ts` and
// `STT_CACHE_NETWORK` in `lib/stt-cache`.
const PAYOUT_ADDRESS_NETWORK_ID = CARDANO_NETWORK === "mainnet" ? 1 : 0;

// Mainnet bech32 headers; both testnets (preprod, preview) use the `_test` variants.
const MAINNET_BECH32_PREFIXES = ["addr1", "stake1"] as const;
const TESTNET_BECH32_PREFIXES = ["addr_test1", "stake_test1"] as const;

// A reward (staking) address holds delegation, not spendable outputs, so it is never a
// payment destination on any network.
const STAKE_ADDRESS_PREFIXES = ["stake1", "stake_test1"] as const;

const NETWORK_LABELS: Record<CardanoNetwork, string> = {
  preprod: i18n("preprod"),
  preview: i18n("preview"),
  mainnet: i18n("mainnet")
};

/** The payment-address header a destination has to carry on `network`. */
function expectedPaymentPrefix(network: CardanoNetwork): string {
  return network === "mainnet" ? `"addr"` : `"addr_test"`;
}

/** True when `value` starts with a bech32 header from any Cardano address family. */
export function looksLikeCardanoAddress(value: string): boolean {
  return /^(addr1|stake1|addr_test|stake_test)/i.test(value.trim());
}

type CredentialParts = { hash: string; isScript: boolean };

export const CARDANO_CREDENTIAL_HASH_HEX_LENGTH = 56;

/** Cardano verification-key and script credential hashes are exactly 28 bytes. */
export function isCredentialHash(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === CARDANO_CREDENTIAL_HASH_HEX_LENGTH &&
    /^[0-9a-fA-F]+$/.test(value)
  );
}

// On-chain `Address` (Aiken `cardano/address.Address`), the type of
// `StreamingPayment.payout_address`:
//   Address          = Constr 0 [payment_credential, stake_credential]
//   Credential       = VerificationKey(hash) | Script(hash)   // Constr 0 | 1
//   stake_credential = Option<StakeCredential>                // Some=Constr 0 | None=Constr 1
//   StakeCredential  = Inline(Credential) | Pointer{...}       // Constr 0 | 1
// The contract compares it for structural equality against a transaction
// `output.address` (lib/wallet/rules.ak, lib/streaming_payments/transitions.ak),
// so it must be a real Address constructor, not a bech32 ByteArray.
// Pointer stake credentials are rejected because new pointer addresses are not
// valid ledger outputs from Conway protocol version 9 onward.

/**
 * Encode a bech32 Cardano address into the on-chain `Address` Plutus datum
 * expected by `StreamingPayment.payout_address`. Mirrors the off-chain
 * reference in `add_subscription.mjs` (`mPubKeyAddress(...)`).
 *
 * Throws if `value` is empty or not a valid Cardano address. This is the
 * same fail-fast contract the other `serialize*` helpers use for bad input.
 */
/**
 * A human-readable reason `value` cannot be paid to on `network`, or `null` when it is
 * usable.
 *
 * Runs the same `deserializeAddress` check that `encodePayoutAddressToData` fails on, so an
 * address accepted here cannot fail encoding later. The difference is only *when* the user
 * hears about it. The underlying bech32 errors are library internals
 * (`Unknown letter: "_". Allowed: qpzry9x8gf2tvdw0s3jn54khce6mua7l`) and are never surfaced.
 *
 * The network check matters as much as the parse: the wallet moves funds on
 * `CARDANO_NETWORK` (`lib/cardano-network.ts`), so an address minted for the other network
 * would encode to a credential that network's ledger cannot resolve, and the funds would be
 * unreachable. The bech32 header names the network, so the obvious mismatch (`addr_test1...`
 * vs `addr1...`) is caught before the parse and gets a reason that names the fix.
 */
export function describeAddressProblemForNetwork(
  network: CardanoNetwork,
  value: string
): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return i18n("enterTheAddressYouWantToSendTo");
  }

  // Bech32 permits an all-uppercase encoding, so the header checks fold case first.
  const folded = trimmed.toLowerCase();

  const wrongNetworkPrefixes =
    network === "mainnet" ? TESTNET_BECH32_PREFIXES : MAINNET_BECH32_PREFIXES;
  if (wrongNetworkPrefixes.some((prefix) => folded.startsWith(prefix))) {
    const pastedNetwork = network === "mainnet" ? i18n("testnet") : i18n("mainnetLowercase");
    return i18n("wrongNetworkAddress", {
      pastedNetwork,
      network: NETWORK_LABELS[network],
      prefix: expectedPaymentPrefix(network)
    });
  }

  // Checked before the parse: `deserializeAddress` reads a reward address's stake key
  // hash as its `pubKeyHash`, so a stake address would otherwise pass the payment-part
  // check and encode to a payment credential nobody holds.
  if (STAKE_ADDRESS_PREFIXES.some((prefix) => folded.startsWith(prefix))) {
    return i18n("stakingAddressCannotReceivePayment", {
      prefix: expectedPaymentPrefix(network)
    });
  }

  let deserialized: ReturnType<typeof deserializeAddress>;
  try {
    deserialized = deserializeAddress(trimmed);
  } catch {
    return i18n("invalidCardanoAddress");
  }

  if (!deserialized.pubKeyHash && !deserialized.scriptHash) {
    return i18n("addressHasNoPaymentPart");
  }

  return null;
}

/** {@link describeAddressProblemForNetwork} on the network this app is deployed on. */
export function describeAddressProblem(value: string): string | null {
  return describeAddressProblemForNetwork(CARDANO_NETWORK, value);
}

export function encodePayoutAddressToData(
  value: string,
  label = i18n("payoutAddress")
): ConstrData {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(i18n("labelMustBeBech32Address", { label }));
  }

  let deserialized: ReturnType<typeof deserializeAddress>;
  try {
    deserialized = deserializeAddress(trimmed);
  } catch {
    throw new Error(i18n("labelValueIsInvalidAddress", { label, value: trimmed }));
  }

  const paymentHash = deserialized.pubKeyHash || deserialized.scriptHash;
  if (!paymentHash) {
    throw new Error(i18n("labelValueNeedsPaymentCredential", { label, value: trimmed }));
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
// datum: Some = Constr 0 [Credential], None = Constr 1 []. Note this is a bare
// `Option<Credential>`, NOT an Address's `Option<StakeCredential>` (no `Inline`
// wrapper), so we read the Credential directly out of the `Some`.
function readIntendedStakeCredential(
  stakeOption: unknown
): { kind: "none" } | { kind: "some"; credential: CredentialParts } | null {
  if (!isConstrData(stakeOption)) {
    return null;
  }

  if (stakeOption.alternative === 1 && stakeOption.fields.length === 0) {
    return { kind: "none" };
  }

  if (stakeOption.alternative !== 0 || stakeOption.fields.length !== 1) {
    return null;
  }

  const credential = readCredentialParts(stakeOption.fields[0]);
  return credential ? { kind: "some", credential } : null;
}

/**
 * The wallet's canonical receive address: the spend-script payment credential
 * combined with the `intended_stake_credential` recorded in the STT State datum.
 *
 * When the datum credential is `None` (the current default for every wallet),
 * this is the enterprise address, byte-for-byte identical to
 * `resolveWalletSpendAddress`, so there is no behaviour change until a wallet
 * actually sets a stake credential. When it is `Some(credential)`, the result is
 * the base/staking address that funds should be received at. Returns `null` on a
 * malformed credential so callers can fall back to the enterprise address.
 */
export function composeWalletReceiveAddress(
  paymentScriptHash: string,
  intendedStakeCredential: unknown
): string | null {
  const intendedStake = readIntendedStakeCredential(intendedStakeCredential);
  if (!intendedStake) {
    return null;
  }
  const stake = intendedStake.kind === "some" ? intendedStake.credential : undefined;
  try {
    const address = scriptAddress(paymentScriptHash, stake?.hash, stake?.isScript);
    return serializeAddressObj(address, PAYOUT_ADDRESS_NETWORK_ID);
  } catch {
    return null;
  }
}

export function isCredentialData(value: unknown): value is ConstrData {
  return (
    isConstrData(value) &&
    value.fields.length === 1 &&
    (value.alternative === 0 || value.alternative === 1) &&
    isCredentialHash(value.fields[0])
  );
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
  if (!isCredentialHash(hash)) {
    return null;
  }

  return { hash, isScript: value.alternative === 1 };
}

export function isStakeCredentialData(value: unknown): value is ConstrData {
  return (
    isConstrData(value) &&
    value.alternative === 0 &&
    value.fields.length === 1 &&
    isCredentialData(value.fields[0])
  );
}

/** Validate the State's bare Option<Credential> intended stake credential. */
export function isIntendedStakeCredentialData(value: unknown): value is ConstrData {
  if (!isConstrData(value)) {
    return false;
  }

  if (value.alternative === 1) {
    return value.fields.length === 0;
  }

  return value.alternative === 0 && value.fields.length === 1 && isCredentialData(value.fields[0]);
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

  // None => no fields; Some => exactly one valid StakeCredential field.
  if (stakeOption.alternative === 1) {
    return stakeOption.fields.length === 0;
  }

  return (
    stakeOption.alternative === 0 &&
    stakeOption.fields.length === 1 &&
    isStakeCredentialData(stakeOption.fields[0])
  );
}

/**
 * Decode an on-chain `Address` Plutus datum back to a bech32 string for the
 * form. A plain string passes through unchanged (backward compatibility with
 * datums written before payout addresses were structured). Returns "" when the
 * value is absent or cannot be decoded to an address.
 */
export function decodePayoutAddressFromData(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return describeAddressProblem(trimmed) === null ? trimmed : "";
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
