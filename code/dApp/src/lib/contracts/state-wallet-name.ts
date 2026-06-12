export const DEFAULT_WALLET_NAME = "Smart wallet";
// Mirror of `lib/constants.ak::max_wallet_name_bytes`; parity enforced by
// `constants-parity.test.ts`.
export const MAX_WALLET_NAME_BYTES = 32;

const HEX_PAIR_PATTERN = /^[0-9a-f]*$/i;

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function normalizeWalletName(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : DEFAULT_WALLET_NAME;
}

export function walletNameByteLength(value: string): number {
  return encodeUtf8(value).byteLength;
}

export function walletNameDatumByteLength(value: string): number {
  const normalized = value.trim();
  if (normalized.length % 2 === 0 && HEX_PAIR_PATTERN.test(normalized)) {
    return normalized.length / 2;
  }

  return walletNameByteLength(normalized);
}

export function clampWalletNameInput(value: string): string {
  let next = "";

  for (const char of value) {
    const candidate = `${next}${char}`;
    if (walletNameByteLength(candidate) > MAX_WALLET_NAME_BYTES) {
      break;
    }
    next = candidate;
  }

  return next;
}

export function encodeWalletNameForDatum(value: string): string {
  const normalized = normalizeWalletName(value);
  const bytes = encodeUtf8(normalized);

  if (bytes.byteLength > MAX_WALLET_NAME_BYTES) {
    throw new Error(`Wallet name must fit in ${MAX_WALLET_NAME_BYTES} bytes.`);
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function decodeWalletNameFromDatum(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_WALLET_NAME;
  }

  const normalized = value.trim();
  if (!normalized) {
    return DEFAULT_WALLET_NAME;
  }

  if (normalized.length % 2 === 0 && HEX_PAIR_PATTERN.test(normalized)) {
    const bytes = new Uint8Array(
      normalized.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []
    );
    const decoded = decodeUtf8(bytes).trim();
    return decoded || DEFAULT_WALLET_NAME;
  }

  return normalized;
}
