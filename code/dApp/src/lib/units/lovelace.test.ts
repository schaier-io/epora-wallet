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

test("formatLovelaceAsAda stays exact past Number.MAX_SAFE_INTEGER", () => {
  // 9,007,199,254.740993 ADA — the naive Number(lovelace)/1e6 path loses the
  // trailing digit here; the bigint implementation must not.
  assert.equal(formatLovelaceAsAda("9007199254740993"), "9,007,199,254.740993");
});

test("formatLovelaceAsAdaRounded rounds to the requested precision", () => {
  assert.equal(formatLovelaceAsAdaRounded("1499999", 1), "1.5");
  assert.equal(formatLovelaceAsAdaRounded("1500000", 0), "2");
  assert.equal(formatLovelaceAsAdaRounded("1000000", 2), "1");
});

test("parseAdaToLovelace inverts ADA display back to lovelace", () => {
  assert.equal(parseAdaToLovelace("1.5"), "1500000");
  assert.equal(parseAdaToLovelace("1,234.5"), "1234500000");
  assert.equal(parseAdaToLovelace("0"), "0");
  assert.equal(parseAdaToLovelace("1.2345678"), null);
  assert.equal(parseAdaToLovelace("abc"), null);
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
