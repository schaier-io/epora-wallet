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
 * One line stood for every empty outcome, so "nobody is paying you" and "we could not read
 * the wallets that might be" looked identical. Only one of those is worth chasing an invoice
 * over. These tests hold the four outcomes apart.
 */

test("nothing on the network is not reported as nothing for you", () => {
  const message = describeEmptyScan(scan({ walletsScanned: 0 }));
  assert.match(message, /No Epora wallets were found on this network/);
  assert.doesNotMatch(message, /No scheduled payments to your wallet/);
});

test("a scan where every wallet failed says so, and does not claim an answer", () => {
  const message = describeEmptyScan(scan({ walletsScanned: 4, walletsUnreadable: 4 }));
  assert.match(message, /None of the 4 Epora wallets/);
  assert.match(message, /not an answer about your payments/);
});

test("a clean scan with no payments says exactly that, with no caveat", () => {
  const message = describeEmptyScan(scan());
  assert.match(message, /No scheduled payments to your wallet in the 4 wallets/);
  assert.doesNotMatch(message, /could not be read/);
});

test("a partial scan counts only the wallets it could actually read", () => {
  const message = describeEmptyScan(scan({ walletsScanned: 4, walletsUnreadable: 3 }));
  assert.match(message, /in the 1 wallet that could be read/);
  assert.match(message, /3 wallets could not be read/);
  assert.match(message, /could be hiding there/);
});

test("a clean scan needs no incompleteness warning", () => {
  assert.equal(describeIncompleteScan(scan()), null);
});

test("a list built from a partial read says it is partial", () => {
  const message = describeIncompleteScan(scan({ walletsUnreadable: 2, entriesSkipped: 1 }));
  assert.ok(message);
  assert.match(message, /2 wallets could not be read of 4/);
  assert.match(message, /1 scheduled payment entry could not be read/);
});

test("counts read as real singulars and plurals", () => {
  const one = describeIncompleteScan(scan({ walletsUnreadable: 1, entriesSkipped: 2 }));
  assert.match(one ?? "", /1 wallet could not be read/);
  assert.match(one ?? "", /2 scheduled payment entries could not be read/);
});
