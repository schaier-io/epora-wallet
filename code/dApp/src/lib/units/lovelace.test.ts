import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WITHDRAWAL_LOVELACE,
  LOVELACE_PER_ADA,
  formatLovelaceAsAda,
  formatLovelaceAsAdaRounded,
  lovelaceToAdaNumber,
  parseAdaToLovelace
} from "./lovelace";

test("LOVELACE_PER_ADA is one million and the default withdrawal is 1 ADA", () => {
  assert.equal(LOVELACE_PER_ADA, 1_000_000n);
  assert.equal(DEFAULT_WITHDRAWAL_LOVELACE, "1000000");
  assert.equal(formatLovelaceAsAda(DEFAULT_WITHDRAWAL_LOVELACE), "1");
});

test("formatLovelaceAsAda groups thousands and trims trailing fraction zeros", () => {
  assert.equal(formatLovelaceAsAda("1234500000"), "1,234.5");
  assert.equal(formatLovelaceAsAda(1_000_000n), "1");
  assert.equal(formatLovelaceAsAda("1500000"), "1.5");
  assert.equal(formatLovelaceAsAda("500000"), "0.5");
});

test("formatLovelaceAsAda handles negatives and non-numeric input", () => {
  assert.equal(formatLovelaceAsAda("-2500000"), "-2.5");
  assert.equal(formatLovelaceAsAda("not-a-number"), "not-a-number");
});

// BigInt("") and BigInt("   ") are both 0n, and BigInt("0x10") is 16n. An amount
// field the reader has not filled in yet reaches these helpers as "", and it was
// shown as a real zero balance rather than as nothing.
test("formatLovelaceAsAda does not invent an amount for input BigInt would accept", () => {
  assert.equal(formatLovelaceAsAda(""), "");
  assert.equal(formatLovelaceAsAda("   "), "   ");
  assert.equal(formatLovelaceAsAda("0x10"), "0x10");
  assert.equal(formatLovelaceAsAdaRounded(""), "");
  assert.equal(formatLovelaceAsAdaRounded("0x10"), "0x10");
});

test("formatLovelaceAsAda still reads a plainly signed integer", () => {
  assert.equal(formatLovelaceAsAda("+2500000"), "2.5");
  assert.equal(formatLovelaceAsAda(" 2500000 "), "2.5");
  assert.equal(formatLovelaceAsAda("0"), "0");
});

test("formatLovelaceAsAda stays exact past Number.MAX_SAFE_INTEGER", () => {
  // 9,007,199,254.740993 ADA: the naive Number(lovelace)/1e6 path loses the
  // trailing digit here; the bigint implementation must not.
  assert.equal(formatLovelaceAsAda("9007199254740993"), "9,007,199,254.740993");
});

test("formatLovelaceAsAdaRounded truncates toward zero, never up", () => {
  // These three used to assert half-away-from-zero ("1.5", "2", "1"). A displayed
  // balance must not round UP: showing "1" for 0.999999 ADA gets a 1 ADA send
  // refused. Truncation keeps the displayed figure spendable.
  assert.equal(formatLovelaceAsAdaRounded("1499999", 1), "1.4");
  assert.equal(formatLovelaceAsAdaRounded("1500000", 0), "1");
  assert.equal(formatLovelaceAsAdaRounded("1000000", 2), "1");
});

test("formatLovelaceAsAdaRounded never shows more ADA than the wallet holds", () => {
  // The reported case: a balance one lovelace under 1 ADA must not display as "1".
  assert.equal(formatLovelaceAsAdaRounded("999999", 1), "0.9");
  assert.equal(formatLovelaceAsAdaRounded("999999", 2), "0.99");
  assert.equal(formatLovelaceAsAdaRounded("999999", 0), "0");
});

test("formatLovelaceAsAdaRounded truncates the magnitude, so negatives read toward zero", () => {
  // Not the same direction as above, and this test says so rather than filing these under
  // the "never shows more" name: -1.9 is greater than -1.95. The only caller passes a wallet
  // balance and cannot reach this, so it is pinned as a fact about the helper, not as the
  // behaviour a caller should want.
  assert.equal(formatLovelaceAsAdaRounded("-1950000", 1), "-1.9");
  assert.equal(formatLovelaceAsAdaRounded("-999999", 0), "-0");
});

test("parseAdaToLovelace inverts ADA display back to lovelace", () => {
  assert.equal(parseAdaToLovelace("1.5"), "1500000");
  assert.equal(parseAdaToLovelace("1,234.5"), "1234500000");
  assert.equal(parseAdaToLovelace("1,234,567.25"), "1234567250000");
  assert.equal(parseAdaToLovelace("0"), "0");
  assert.equal(parseAdaToLovelace("1.2345678"), null);
  assert.equal(parseAdaToLovelace("abc"), null);
});

test("parseAdaToLovelace never reads a comma as a decimal point", () => {
  // "1,5" on a German keyboard used to parse as 15 ADA.
  assert.equal(parseAdaToLovelace("1,5"), null);
  assert.equal(parseAdaToLovelace("12,34"), null);
  assert.equal(parseAdaToLovelace("1,"), null);
});

test("parseAdaToLovelace accepts the halves of an amount still being typed", () => {
  assert.equal(parseAdaToLovelace("1."), "1000000");
  assert.equal(parseAdaToLovelace(".5"), "500000");
  assert.equal(parseAdaToLovelace("."), null);
  assert.equal(parseAdaToLovelace(""), null);
});

test("lovelaceToAdaNumber divides for chart math", () => {
  assert.equal(lovelaceToAdaNumber("2500000"), 2.5);
  assert.equal(lovelaceToAdaNumber(1_000_000n), 1);
  assert.equal(lovelaceToAdaNumber(500_000), 0.5);
});

test("formatLovelaceAsAdaRounded clamps fractionDigits to lovelace precision (6) instead of dividing by zero", () => {
  // > 6 digits would make scale exceed LOVELACE_PER_ADA and previously fell back
  // to full precision via a swallowed divide-by-zero. Now it clamps to 6.
  assert.equal(formatLovelaceAsAdaRounded("1234567", 9), formatLovelaceAsAdaRounded("1234567", 6));
  assert.equal(formatLovelaceAsAdaRounded("1000000", 12), "1");
  // A fractional value keeps its 6 meaningful digits (clamped, not full-precision fallback).
  assert.equal(formatLovelaceAsAdaRounded("1500000", 8), "1.500000");
});
