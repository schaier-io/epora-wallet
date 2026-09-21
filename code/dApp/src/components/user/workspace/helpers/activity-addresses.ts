import { bech32Decode } from "@/lib/bech32";

const PAYMENT_HASH_LENGTH = 28;
const HEADER_LENGTH = 1;
const BASE_SCRIPT_TYPES = new Set([1, 3]);
const ENTERPRISE_SCRIPT_TYPE = 7;
const MAINNET_NETWORK_ID = 1;
const NETWORK_MASK = 0x0f;

function scriptPaymentIdentity(address: string) {
  const decoded = bech32Decode(address);
  if (!decoded) return null;
  const { bytes, hrp } = decoded;
  const header = bytes[0];
  if (header === undefined) return null;
  const type = header >> 4;
  const network = header & NETWORK_MASK;
  if (hrp !== (network === MAINNET_NETWORK_ID ? "addr" : "addr_test")) return null;
  const expectedLength = BASE_SCRIPT_TYPES.has(type)
    ? HEADER_LENGTH + 2 * PAYMENT_HASH_LENGTH
    : type === ENTERPRISE_SCRIPT_TYPE
      ? HEADER_LENGTH + PAYMENT_HASH_LENGTH
      : null;
  if (bytes.length !== expectedLength) return null;
  return { network, hash: bytes.slice(HEADER_LENGTH, HEADER_LENGTH + PAYMENT_HASH_LENGTH) };
}

/** Wallet stake changes preserve the script payment credential and network. */
export function createWalletAddressMatcher(walletAddress: string) {
  const wallet = scriptPaymentIdentity(walletAddress);
  return (candidate: string): boolean => {
    if (candidate === walletAddress) return true;
    if (!wallet) return false;
    const other = scriptPaymentIdentity(candidate);
    return other !== null && wallet.network === other.network
      && wallet.hash.every((byte, index) => byte === other.hash[index]);
  };
}
