import assert from "node:assert/strict";
import test from "node:test";
import type { PayeeScanResult } from "@/components/payee/collect-payee-streaming-payments";
import {
  describeEmptyScan,
  describeIncompleteScan
} from "@/components/payee/payee-scan-messages";

function scan(overrides: Partial<PayeeScanResult> = {}): PayeeScanResult {
  return {
    payments: [],
    walletsScanned: 4,
    walletsUnreadable: 0,
    entriesSkipped: 0,
    ...overrides
  };
}

/**
 * The empty state now answers one question -- "is anyone scheduling payments to this wallet?"
 * -- and reports no counts of other people's wallets. "We could not look" still has to read
 * differently from "nobody is paying you"; only one of those is worth chasing an invoice
 * over. These tests hold those two apart and keep the counts out.
 */

test("an empty network reads as an empty list, not as a network report", () => {
  const message = describeEmptyScan(scan({ walletsScanned: 0 }));
  assert.match(message, /No scheduled payments to this wallet yet/);
  assert.doesNotMatch(message, /Epora wallets/);
});

test("a scan where every wallet failed says so, and does not claim an answer", () => {
  const message = describeEmptyScan(scan({ walletsScanned: 4, walletsUnreadable: 4 }));
  assert.match(message, /chain data could not be read/);
  assert.match(message, /not an answer about your payments/);
  assert.doesNotMatch(message, /\b4\b/);
});

test("a clean scan with no payments says exactly that, with no caveat", () => {
  const message = describeEmptyScan(scan());
  assert.match(message, /No scheduled payments to this wallet yet/);
  assert.doesNotMatch(message, /could not be read/);
});

test("a partial scan warns without counting anyone's wallets", () => {
  const message = describeEmptyScan(scan({ walletsScanned: 4, walletsUnreadable: 3 }));
  assert.match(message, /No scheduled payments to this wallet yet/);
  assert.match(message, /Some chain data could not be read/);
  assert.match(message, /could be hiding there/);
  assert.doesNotMatch(message, /\b3\b|\b4\b/);
});

test("a clean scan needs no incompleteness warning", () => {
  assert.equal(describeIncompleteScan(scan()), null);
});

test("a list built from a partial read says it is partial, without wallet counts", () => {
  const message = describeIncompleteScan(scan({ walletsUnreadable: 2, entriesSkipped: 1 }));
  assert.ok(message);
  assert.match(message, /some chain data could not be read/);
  assert.match(message, /1 scheduled payment entry could not be read/);
  assert.doesNotMatch(message, /\b2 wallets\b/);
});
