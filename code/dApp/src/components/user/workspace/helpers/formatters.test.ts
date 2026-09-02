import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAssetSelectionOptions,
  buildCardanoscanAddressUrl,
  buildCardanoscanTransactionUrl,
  formatActivityAddressLabel,
  formatAmountSummary,
  formatCompactHash,
  formatCountLabel,
  formatDurationMillisLabel,
  formatInputRefLabel,
  formatReceiptAmountSummary,
  formatSignedAmountSummary,
  formatTimestampLabel,
  formatTransferControlId,
  formatWalletTransactionAmountSummary,
  formatWalletTransactionRelative,
  formatWalletTransactionTime,
  normalizeBlockTimeMs
} from "./formatters";
import { POLICY_ID_LENGTH } from "@/lib/cardano-assets";
import { type Asset } from "@/lib/types/contracts";

const POLICY = "f".repeat(POLICY_ID_LENGTH);
const USDM = `${POLICY}0014df105553444d`; // known "USDM"
const TIK = `${POLICY}54494b`; // ascii "TIK", unknown

test("cardanoscan url builders target the preprod explorer", () => {
  assert.equal(
    buildCardanoscanTransactionUrl("deadbeef"),
    "https://preprod.cardanoscan.io/transaction/deadbeef"
  );
  assert.equal(
    buildCardanoscanAddressUrl("addr1"),
    "https://preprod.cardanoscan.io/address/addr1"
  );
});

test("formatAmountSummary renders lovelace as ADA and native assets by symbol", () => {
  assert.equal(
    formatAmountSummary([
      { unit: "lovelace", quantity: "1500000" },
      { unit: USDM, quantity: "42" }
    ]),
    "1.5 ₳, 42 USDM"
  );
});

test("formatReceiptAmountSummary filters blank rows and falls back", () => {
  assert.equal(formatReceiptAmountSummary([]), "No amount added yet");
  assert.equal(formatReceiptAmountSummary([], "nothing"), "nothing");
  assert.equal(
    formatReceiptAmountSummary([
      { unit: "  ", quantity: "5" },
      { unit: "lovelace", quantity: "  " },
      { unit: "lovelace", quantity: "2000000" }
    ]),
    "2 ₳"
  );
});

test("formatSignedAmountSummary prefixes signs and shows absolute quantities", () => {
  assert.equal(
    formatSignedAmountSummary([
      { unit: "lovelace", quantity: "-2000000" },
      { unit: TIK, quantity: "5" },
      { unit: TIK, quantity: "0" }
    ]),
    "-2 ₳, +5 TIK, 0 TIK"
  );
});

test("formatTransferControlId replaces non-id characters with dashes", () => {
  assert.equal(formatTransferControlId("lovelace"), "lovelace");
  assert.equal(formatTransferControlId(`${POLICY}.name!`), `${POLICY}-name-`);
});

test("formatInputRefLabel and formatCompactHash format references and hashes", () => {
  assert.equal(formatInputRefLabel("abcd", 3), "abcd#3");
  // shortenIdentifier(hash, 10, 6): long hash gets middle-truncated
  const hash = "0123456789abcdef0123456789abcdef";
  assert.equal(formatCompactHash(hash), "0123456789...abcdef");
  // short values are returned unchanged
  assert.equal(formatCompactHash("short"), "short");
});

test("formatCountLabel handles singular, plural, and custom plurals", () => {
  assert.equal(formatCountLabel(1, "input"), "1 input");
  assert.equal(formatCountLabel(0, "input"), "0 inputs");
  assert.equal(formatCountLabel(3, "input"), "3 inputs");
  assert.equal(formatCountLabel(2, "entry", "entries"), "2 entries");
});

test("normalizeBlockTimeMs scales seconds to ms, passes ms through, rejects invalid", () => {
  assert.equal(normalizeBlockTimeMs(1_700_000_000), 1_700_000_000_000); // seconds -> ms
  assert.equal(normalizeBlockTimeMs(1_700_000_000_000), 1_700_000_000_000); // already ms
  assert.equal(normalizeBlockTimeMs(undefined), null);
  assert.equal(normalizeBlockTimeMs(Number.NaN), null);
  assert.equal(normalizeBlockTimeMs(Number.POSITIVE_INFINITY), null);
});

test("formatWalletTransactionTime formats a normalized time in UTC", () => {
  // 2023-11-14T22:13:20Z (seconds input, gets scaled to ms)
  assert.equal(formatWalletTransactionTime(1_700_000_000), "Nov 14, 10:13 PM");
  assert.equal(formatWalletTransactionTime(undefined), null);
});

test("formatWalletTransactionRelative buckets recent times and returns null when out of range", () => {
  const now = Date.now();
  assert.equal(formatWalletTransactionRelative(now - 30_000), "just now");
  assert.equal(formatWalletTransactionRelative(now - 5 * 60_000), "5m ago");
  assert.equal(formatWalletTransactionRelative(now - 3 * 3_600_000), "3h ago");
  assert.equal(formatWalletTransactionRelative(now - 2 * 86_400_000), "2d ago");
  assert.equal(formatWalletTransactionRelative(now + 5 * 60_000), "5m from now");
  // older than a week -> null
  assert.equal(formatWalletTransactionRelative(now - 30 * 86_400_000), null);
  assert.equal(formatWalletTransactionRelative(undefined), null);
});

test("formatTimestampLabel names the moment, not the stored millisecond value", () => {
  const label = formatTimestampLabel(1_700_000_000_000);
  assert.doesNotMatch(label, /1700000000000/);
  assert.match(label, /2023/);
  assert.equal(formatTimestampLabel(Number.NaN), `${Number.NaN}`);
});

test("formatWalletTransactionAmountSummary summarizes ada + token type counts", () => {
  assert.equal(
    formatWalletTransactionAmountSummary([{ unit: "lovelace", quantity: "0" }]),
    "no balance change"
  );
  assert.equal(
    formatWalletTransactionAmountSummary([{ unit: "lovelace", quantity: "3000000" }]),
    "3 ₳"
  );
  assert.equal(
    formatWalletTransactionAmountSummary([
      { unit: "lovelace", quantity: "3000000" },
      { unit: TIK, quantity: "1" }
    ]),
    "3 ₳, 1 token type"
  );
  assert.equal(
    formatWalletTransactionAmountSummary([
      { unit: "lovelace", quantity: "3000000" },
      { unit: TIK, quantity: "1" },
      { unit: USDM, quantity: "2" }
    ]),
    "3 ₳, 2 token types"
  );
});

test("formatActivityAddressLabel identifies this wallet, connected wallet, and others", () => {
  assert.equal(formatActivityAddressLabel(null, "walletA"), "Unknown address");
  assert.equal(formatActivityAddressLabel("walletA", "walletA"), "This smart wallet");
  assert.equal(
    formatActivityAddressLabel("connectedA", "walletA", "connectedA"),
    "Connected wallet"
  );
  // Falls through to shortenAddress for an unknown long address.
  const other = "addr_test1" + "q".repeat(40);
  assert.equal(formatActivityAddressLabel(other, "walletA"), `${other.slice(0, 12)}...${other.slice(-8)}`);
});

test("buildAssetSelectionOptions sorts lovelace first, then known before unknown, and builds labels", () => {
  const assets: Asset[] = [
    { unit: TIK, quantity: "7" },
    { unit: USDM, quantity: "42" },
    { unit: "lovelace", quantity: "2500000" }
  ];
  const options = buildAssetSelectionOptions(assets);
  assert.deepEqual(
    options.map((option) => option.unit),
    ["lovelace", USDM, TIK]
  );

  const [lovelace, usdm, tik] = options;
  // Lovelace carries a knownMeta with an empty display name; the label falls
  // back to the bare symbol instead of a dangling " · " separator.
  assert.equal(lovelace!.label, "ADA");
  assert.equal(lovelace!.availableLabel, "2.5 ADA available");
  assert.equal(lovelace!.maxQuantity, "2500000");
  assert.equal(usdm!.label, "USDM · Mehen USDM"); // known meta name appended
  assert.equal(usdm!.availableLabel, "42 USDM available");
  assert.equal(tik!.label, "TIK"); // unknown -> symbol only
  assert.match(tik!.searchableText, /tik/);
});

// The proof-of-life prose used to print this value raw, so the shipped 30-day default
// read as "extends the proof of life by 2592000000".
test("formatDurationMillisLabel names the largest whole unit", () => {
  assert.equal(formatDurationMillisLabel(30 * 24 * 60 * 60 * 1000), "30 days");
  assert.equal(formatDurationMillisLabel(24 * 60 * 60 * 1000), "1 day");
  assert.equal(formatDurationMillisLabel(3 * 60 * 60 * 1000), "3 hours");
  assert.equal(formatDurationMillisLabel(60 * 1000), "1 minute");
  // No whole unit divides 90 seconds, so it falls back to the stored unit rather
  // than rounding a number the reader would then be unable to reproduce.
  assert.equal(formatDurationMillisLabel(90_000), "90000 milliseconds");
});

test("formatDurationMillisLabel keeps an unreadable duration honest", () => {
  assert.equal(formatDurationMillisLabel(0), "0 days");
  // `splitDurationMillis` only parses digits, so anything else falls through to the
  // raw figure rather than being reported as a duration it is not.
  assert.equal(formatDurationMillisLabel(-1), "-1 ms");
});
