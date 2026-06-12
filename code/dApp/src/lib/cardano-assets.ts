/**
 * Known Cardano assets registry.
 * Used for friendly names in the asset list + selector dropdown.
 *
 * Asset units on Cardano are `policyId (56 hex) + assetName (hex)`.
 * For CIP-67 fungible tokens the asset name carries a 4-byte prefix
 * (`0014df10`) before the human-readable symbol.
 */

export type KnownAssetMeta = {
  symbol: string;
  name: string;
  /** Visual hint used by the UI to pick an accent color. */
  accent: "stable" | "native" | "defi" | "meme" | "utility" | "nft";
  /** Optional local or remote image URL for the asset logo. */
  icon?: string;
  /** Optional brand color used as a background tint when no logo is shown. */
  color?: string;
};

const CIP_67_FT_PREFIX = "0014df10";
const CIP_67_REFERENCE_PREFIX = "000643b0";
const CIP_67_USER_NFT_PREFIX = "000de140";

/**
 * Strip CIP-67 reference prefixes from an asset-name hex so we can match
 * `0014df105553444d` (`\x00\x14\xdf\x10USDM`) against `USDM`.
 */
function stripCip67Prefix(assetNameHex: string): string {
  const lower = assetNameHex.toLowerCase();
  if (lower.startsWith(CIP_67_FT_PREFIX)) return lower.slice(8);
  if (lower.startsWith(CIP_67_REFERENCE_PREFIX)) return lower.slice(8);
  if (lower.startsWith(CIP_67_USER_NFT_PREFIX)) return lower.slice(8);
  return lower;
}

/**
 * Decode a printable-ASCII asset name from its hex form.
 * Returns the original hex if non-printable bytes are present.
 */
function hexToAscii(hex: string): string {
  if (!hex) return "";
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return hex;
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16);
    if (code < 0x20 || code > 0x7e) return hex;
    out += String.fromCharCode(code);
  }
  return out;
}

/**
 * Known-by-name registry. The lookup is case-insensitive on the *decoded*
 * asset name (after CIP-67 prefix stripping). Stable + popular ecosystem
 * tokens are included; extend as needed.
 */
const KNOWN_BY_SYMBOL: Record<string, KnownAssetMeta> = {
  USDM: { symbol: "USDM", name: "Mehen USDM", accent: "stable" },
  USDC: { symbol: "USDC", name: "Anzens USDC", accent: "stable" },
  USDT: { symbol: "USDT", name: "Tether USDT", accent: "stable" },
  DJED: { symbol: "DJED", name: "Djed", accent: "stable" },
  SHEN: { symbol: "SHEN", name: "Djed reserve", accent: "stable" },
  iUSD: { symbol: "iUSD", name: "Indigo iUSD", accent: "stable" },
  MIN: { symbol: "MIN", name: "Minswap", accent: "defi" },
  LQ: { symbol: "LQ", name: "Liqwid", accent: "defi" },
  AGIX: { symbol: "AGIX", name: "SingularityNET", accent: "utility" },
  WMT: { symbol: "WMT", name: "World Mobile Token", accent: "utility" },
  COPI: { symbol: "COPI", name: "Cornucopias", accent: "utility" },
  CHARLI3: { symbol: "CHARLI3", name: "Charli3", accent: "defi" },
  HOSKY: { symbol: "HOSKY", name: "Hosky", accent: "meme" },
  SNEK: { symbol: "SNEK", name: "Snek", accent: "meme" },
  BOOK: { symbol: "BOOK", name: "Book.io", accent: "utility" },
  iETH: { symbol: "iETH", name: "Indigo iETH", accent: "defi" },
  iBTC: { symbol: "iBTC", name: "Indigo iBTC", accent: "defi" },
  INDY: { symbol: "INDY", name: "Indigo INDY", accent: "defi" }
};

/**
 * Split a Cardano asset unit into policyId and assetName.
 */
function splitAssetUnit(unit: string): { policyId: string; assetNameHex: string } {
  if (unit === "lovelace") return { policyId: "", assetNameHex: "" };
  if (unit.length < 56) return { policyId: "", assetNameHex: unit };
  return { policyId: unit.slice(0, 56), assetNameHex: unit.slice(56) };
}

/**
 * Resolve a friendly display for an asset unit.
 * Returns `{ symbol, name }` if known, otherwise the best-effort decoded name.
 */
export function resolveAssetIdentity(unit: string): {
  symbol: string;
  name: string;
  knownMeta: KnownAssetMeta | null;
  decodedAssetName: string;
} {
  if (unit === "lovelace") {
    return {
      symbol: "ADA",
      name: "",
      knownMeta: { symbol: "ADA", name: "", accent: "native" },
      decodedAssetName: "ADA"
    };
  }

  const { assetNameHex } = splitAssetUnit(unit);
  const strippedHex = stripCip67Prefix(assetNameHex);
  const decoded = hexToAscii(strippedHex).trim();

  if (decoded.length > 0) {
    const knownMeta = KNOWN_BY_SYMBOL[decoded] ?? KNOWN_BY_SYMBOL[decoded.toUpperCase()] ?? null;
    if (knownMeta) {
      return { symbol: knownMeta.symbol, name: knownMeta.name, knownMeta, decodedAssetName: decoded };
    }
    return { symbol: decoded, name: decoded, knownMeta: null, decodedAssetName: decoded };
  }

  return { symbol: shortenHex(unit), name: shortenHex(unit), knownMeta: null, decodedAssetName: "" };
}

function shortenHex(value: string): string {
  if (value.length <= 20) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}
