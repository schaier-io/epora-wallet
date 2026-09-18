/**
 * BIP-173 bech32 encode/decode. A local, dependency-free codec so Cardano
 * address helpers in this app never need the Mesh SDK on the client
 * (`@meshsdk/core` builds to a multi-megabyte serialisation chunk; see
 * app/layout-mesh-boundary.test.ts). Only the original bech32 checksum
 * (constant 1) is implemented: Cardano addresses predate bech32m.
 */

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) checksum ^= GENERATOR[i];
    }
  }
  return checksum;
}

function hrpExpand(hrp: string): number[] {
  const result: number[] = [];
  for (const char of hrp) result.push(char.charCodeAt(0) >> 5);
  result.push(0);
  for (const char of hrp) result.push(char.charCodeAt(0) & 31);
  return result;
}

function verifyChecksum(hrp: string, data: number[]): boolean {
  return polymod([...hrpExpand(hrp), ...data]) === 1;
}

function createChecksum(hrp: string, data: number[]): number[] {
  const zeros = [0, 0, 0, 0, 0, 0];
  const mod = polymod([...hrpExpand(hrp), ...data, ...zeros]) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
  return checksum;
}

/** Regroup `data` from `from`-bit to `to`-bit groups; pads (encode) or demands padding (decode). */
export function convertBits(
  data: number[],
  from: number,
  to: number,
  pad: boolean
): number[] | null {
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];
  const max = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null;
    accumulator = (accumulator << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      result.push((accumulator >> bits) & max);
    }
  }
  if (pad) {
    if (bits > 0) result.push((accumulator << (to - bits)) & max);
  } else if (bits >= from || ((accumulator << (to - bits)) & max) !== 0) {
    return null;
  }
  return result;
}

export function bech32Encode(hrp: string, bytes: Uint8Array): string {
  const data = convertBits([...bytes], 8, 5, true);
  if (!data) throw new Error("bech32: invalid data for encoding");
  const checksum = createChecksum(hrp, data);
  return `${hrp}1${[...data, ...checksum].map((value) => CHARSET[value]).join("")}`;
}

export function bech32Decode(encoded: string): { hrp: string; bytes: Uint8Array } | null {
  if (encoded.length < 8) return null;
  const lower = encoded.toLowerCase();
  const upper = encoded.toUpperCase();
  if (encoded !== lower && encoded !== upper) return null;
  const normalized = lower;
  const separator = normalized.lastIndexOf("1");
  // The separator needs an HRP in front of it and at least the 6-char checksum behind it.
  if (separator < 1 || separator + 7 > normalized.length) return null;
  const hrp = normalized.slice(0, separator);
  if (!/[\x21-\x7e]+$/.test(hrp)) return null;
  const data: number[] = [];
  for (const char of normalized.slice(separator + 1)) {
    const value = CHARSET.indexOf(char);
    if (value === -1) return null;
    data.push(value);
  }
  if (!verifyChecksum(hrp, data)) return null;
  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  if (!bytes) return null;
  return { hrp, bytes: Uint8Array.from(bytes) };
}
