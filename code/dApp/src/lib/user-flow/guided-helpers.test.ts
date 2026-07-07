import { test } from "node:test";
import assert from "node:assert/strict";
import type { UTxO } from "@meshsdk/core";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import {
  buildStreamingPaymentPayoutTransfer,
  combineDurationToMillis,
  combineLocalDateAndTimeToTimestamp,
  computeStreamingPaymentDueAmount,
  formatLovelaceAsAda,
  formatLovelaceAsAdaRounded,
  parseAdaToLovelace,
  rememberRecentRecipient,
  requestedTransferAssets,
  splitDurationMillis,
  splitTimestampToLocalInputParts,
  suggestWalletInputsForRequestedAssets
} from "./guided-helpers";

const DAY_MS = 86_400_000;

function makeStreamingPayment(
  overrides: Partial<StreamingPaymentFormState> = {}
): StreamingPaymentFormState {
  return {
    id: "1",
    payoutAddress: "addr_test1recipient",
    policyId: "",
    assetName: "",
    amountPerDay: "1000000",
    startDate: "0",
    endDate: `${DAY_MS * 10}`,
    paidOutAmount: "0",
    ...overrides
  } as StreamingPaymentFormState;
}

function makeUtxo(txHash: string, outputIndex: number, amount: Array<{ unit: string; quantity: string }>): UTxO {
  return { input: { txHash, outputIndex }, output: { amount } } as UTxO;
}

test("formatLovelaceAsAda renders whole and fractional ADA with grouping", () => {
  assert.equal(formatLovelaceAsAda("1000000"), "1");
  assert.equal(formatLovelaceAsAda("1500000"), "1.5");
  assert.equal(formatLovelaceAsAda("1234567890"), "1,234.56789");
  assert.equal(formatLovelaceAsAda(-2_500_000n), "-2.5");
  assert.equal(formatLovelaceAsAda("not-a-number"), "not-a-number");
});

test("formatLovelaceAsAdaRounded rounds half up at the requested precision", () => {
  assert.equal(formatLovelaceAsAdaRounded("1450000", 1), "1.5");
  assert.equal(formatLovelaceAsAdaRounded("1440000", 1), "1.4");
  assert.equal(formatLovelaceAsAdaRounded("1500000", 0), "2");
  assert.equal(formatLovelaceAsAdaRounded("2000000", 1), "2");
});

test("parseAdaToLovelace accepts up to six decimals and grouping commas", () => {
  assert.equal(parseAdaToLovelace("1"), "1000000");
  assert.equal(parseAdaToLovelace("1.5"), "1500000");
  assert.equal(parseAdaToLovelace("1,234.56789"), "1234567890");
  assert.equal(parseAdaToLovelace("0.000001"), "1");
  assert.equal(parseAdaToLovelace("1.1234567"), null);
  assert.equal(parseAdaToLovelace("-1"), null);
  assert.equal(parseAdaToLovelace("abc"), null);
});

test("parseAdaToLovelace and formatLovelaceAsAda round-trip", () => {
  for (const ada of ["0", "1", "1.5", "42.123456"]) {
    const lovelace = parseAdaToLovelace(ada);
    assert.ok(lovelace !== null);
    assert.equal(formatLovelaceAsAda(lovelace), ada);
  }
});

test("computeStreamingPaymentDueAmount accrues per elapsed day minus payouts", () => {
  const payment = makeStreamingPayment();
  // 3 full days elapsed, nothing paid out yet.
  assert.equal(computeStreamingPaymentDueAmount(payment, DAY_MS * 3), "3000000");
  // Payouts reduce the due amount.
  assert.equal(
    computeStreamingPaymentDueAmount(
      makeStreamingPayment({ paidOutAmount: "2500000" }),
      DAY_MS * 3
    ),
    "500000"
  );
  // Fully paid → nothing due (never negative).
  assert.equal(
    computeStreamingPaymentDueAmount(
      makeStreamingPayment({ paidOutAmount: "5000000" }),
      DAY_MS * 3
    ),
    "0"
  );
});

test("computeStreamingPaymentDueAmount clamps to the schedule end date", () => {
  const payment = makeStreamingPayment({ endDate: `${DAY_MS * 2}` });
  // Reference far beyond the end: only 2 days ever accrue.
  assert.equal(computeStreamingPaymentDueAmount(payment, DAY_MS * 100), "2000000");
});

test("computeStreamingPaymentDueAmount returns 0 for malformed or unstarted schedules", () => {
  assert.equal(
    computeStreamingPaymentDueAmount(makeStreamingPayment({ amountPerDay: "x" }), DAY_MS),
    "0"
  );
  const notStarted = makeStreamingPayment({ startDate: `${DAY_MS * 5}` });
  assert.equal(computeStreamingPaymentDueAmount(notStarted, DAY_MS), "0");
});

test("buildStreamingPaymentPayoutTransfer targets lovelace unless an asset is set", () => {
  const adaTransfer = buildStreamingPaymentPayoutTransfer(
    makeStreamingPayment(),
    "1000000",
    "deadbeef",
    1
  );
  assert.equal(adaTransfer.address, "addr_test1recipient");
  assert.deepEqual(adaTransfer.amount, [{ unit: "lovelace", quantity: "1000000" }]);
  assert.deepEqual(adaTransfer.inlineDatum, {
    alternative: 0,
    fields: [1, "deadbeef", 1]
  });

  const assetTransfer = buildStreamingPaymentPayoutTransfer(
    makeStreamingPayment({ policyId: "ff".repeat(28), assetName: "5553444d" }),
    "5",
    "deadbeef",
    0
  );
  assert.equal(assetTransfer.amount[0]?.unit, `${"ff".repeat(28)}5553444d`);
});

test("suggestWalletInputsForRequestedAssets picks covering UTxOs greedily", () => {
  const utxos = [
    makeUtxo("aa", 0, [{ unit: "lovelace", quantity: "1000000" }]),
    makeUtxo("bb", 1, [{ unit: "lovelace", quantity: "5000000" }]),
    makeUtxo("cc", 2, [{ unit: "tokenunit", quantity: "10" }])
  ];
  // Fully covered by one UTxO → picks the covering one only.
  assert.deepEqual(
    suggestWalletInputsForRequestedAssets(utxos, [{ unit: "lovelace", quantity: "4000000" }]),
    [{ txHash: "bb", outputIndex: 1 }]
  );
  // Mixed request → needs both the lovelace and token UTxOs.
  const mixed = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "500000" },
    { unit: "tokenunit", quantity: "10" }
  ]);
  assert.equal(mixed.length, 2);
  assert.ok(mixed.some((ref) => ref.txHash === "cc"));
});

test("suggestWalletInputsForRequestedAssets returns [] when assets cannot be covered", () => {
  const utxos = [makeUtxo("aa", 0, [{ unit: "lovelace", quantity: "1000000" }])];
  assert.deepEqual(
    suggestWalletInputsForRequestedAssets(utxos, [{ unit: "lovelace", quantity: "2000000" }]),
    []
  );
  assert.deepEqual(
    suggestWalletInputsForRequestedAssets(utxos, [{ unit: "missing", quantity: "1" }]),
    []
  );
});

test("requestedTransferAssets sums amounts by unit with lovelace first", () => {
  const totals = requestedTransferAssets([
    { address: "a", amount: [{ unit: "tokenunit", quantity: "2" }] },
    {
      address: "b",
      amount: [
        { unit: "lovelace", quantity: "1000000" },
        { unit: "tokenunit", quantity: "3" }
      ]
    }
  ]);
  assert.deepEqual(totals, [
    { unit: "lovelace", quantity: "1000000" },
    { unit: "tokenunit", quantity: "5" }
  ]);
});

test("duration parts round-trip through milliseconds", () => {
  assert.deepEqual(splitDurationMillis(`${DAY_MS * 3}`), { amount: "3", unit: "days" });
  assert.deepEqual(splitDurationMillis("3600000"), { amount: "1", unit: "hours" });
  assert.equal(combineDurationToMillis("3", "days"), `${DAY_MS * 3}`);
  assert.equal(combineDurationToMillis("x", "days"), "");
  assert.deepEqual(splitDurationMillis("abc"), { amount: "", unit: "days" });
});

test("local date/time round-trips through a timestamp", () => {
  const timestamp = combineLocalDateAndTimeToTimestamp("2026-03-15", "13:45");
  assert.ok(timestamp);
  const parts = splitTimestampToLocalInputParts(timestamp);
  assert.equal(parts.date, "2026-03-15");
  assert.equal(parts.time, "13:45");
});

test("rememberRecentRecipient dedupes, prepends, and caps the list", () => {
  assert.deepEqual(rememberRecentRecipient(["a", "b"], "b"), ["b", "a"]);
  assert.deepEqual(rememberRecentRecipient([], "  "), []);
  const capped = rememberRecentRecipient(["a", "b", "c", "d", "e"], "f");
  assert.equal(capped.length, 5);
  assert.equal(capped[0], "f");
});
