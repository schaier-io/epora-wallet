/**
 * CIP-19 address helpers the client needs without the Mesh SDK. The SDK's
 * serialisation stack builds to a multi-megabyte chunk that must stay off the
 * first-load path (see app/layout-mesh-boundary.test.ts); these two pure
 * functions cover the only address conversions the workspace performs on
 * rendered pages. Both mirror the Mesh helpers they replace — byte for byte —
 * and the tests pin them to vectors generated from `@meshsdk/core` 1.9.1.
 */

import { bech32Decode, bech32Encode } from "./bech32";

const SCRIPT_HASH_BYTE_LENGTH = 28;
const SCRIPT_HASH_HEX_LENGTH = SCRIPT_HASH_BYTE_LENGTH * 2;
/** CIP-19 reward address: header type nibble 0b1111 (script credential), low nibble = network id. */
const REWARD_SCRIPT_HEADER = 0xf0;
const MAINNET_NETWORK_ID = 1;
const STAKE_HRP = { testnet: "stake_test", mainnet: "stake" } as const;
/** CIP-129 DRep id: key type 0b0010 (DRep), credential type 0b0011 (script). Same HRP on every network. */
const DREP_SCRIPT_HEADER = 0x23;
const DREP_HRP = "drep";
const PAYMENT_ADDRESS_TESTNET_HRP = "addr_test";
const TESTNET_NETWORK_ID = 0;
/** CIP-19 header: high nibble = address type; 0-7 carry a payment credential, 8+ do not. */
const PAYMENT_TYPE_MAX = 7;
const CREDENTIAL_HASH_BYTES = 28;
/** Header byte plus the 28-byte payment credential; pointer addresses only grow beyond this. */
const MIN_PAYMENT_ADDRESS_BYTES = 1 + CREDENTIAL_HASH_BYTES;

function decodeHash28Hex(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length !== SCRIPT_HASH_HEX_LENGTH || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`Invalid 28-byte hash: expected ${SCRIPT_HASH_HEX_LENGTH} hex characters`);
  }
  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

/**
 * The reward (stake) address a script hash earns rewards under, as bech32 —
 * the local replacement for `serializeRewardAddress(hash, true, networkId)`.
 * Throws on a malformed hash, like the Mesh helper it replaces.
 */
export function serializeScriptRewardAddress(scriptHash: string, networkId: 0 | 1): string {
  const header = REWARD_SCRIPT_HEADER | networkId;
  const bytes = Uint8Array.of(header, ...decodeHash28Hex(scriptHash));
  return bech32Encode(networkId === MAINNET_NETWORK_ID ? STAKE_HRP.mainnet : STAKE_HRP.testnet, bytes);
}

/**
 * The CIP-129 DRep id of a script DRep, e.g. the wallet voting under its own script hash.
 * Throws on a malformed hash.
 */
export function serializeScriptDrepId(scriptHash: string): string {
  return bech32Encode(DREP_HRP, Uint8Array.of(DREP_SCRIPT_HEADER, ...decodeHash28Hex(scriptHash)));
}

/**
 * The payment credential (key or script hash) of a testnet payment address, or
 * null for anything else — the local replacement for reading
 * `pubKeyHash || scriptHash` off `deserializeAddress`. Checksummed, so a
 * mistyped address yields null instead of a hash.
 */
export function testnetPaymentCredentialHash(address: string): string | null {
  const decoded = bech32Decode(address.trim());
  if (!decoded || decoded.hrp !== PAYMENT_ADDRESS_TESTNET_HRP) return null;
  if (decoded.bytes.length < MIN_PAYMENT_ADDRESS_BYTES) return null;
  const header = decoded.bytes[0];
  // The header's low nibble names the network; "addr_test" always pairs with testnet.
  if ((header & 0x0f) !== TESTNET_NETWORK_ID) return null;
  const addressType = header >> 4;
  if (addressType > PAYMENT_TYPE_MAX) return null;
  return Buffer.from(decoded.bytes.slice(1, 1 + CREDENTIAL_HASH_BYTES)).toString("hex");
}
