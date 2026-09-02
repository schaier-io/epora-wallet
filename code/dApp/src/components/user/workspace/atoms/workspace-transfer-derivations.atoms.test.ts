import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAssetWealthSeries,
  seriesPointTimestampMs,
  withCurrentBalanceHeld
} from "./workspace-transfer-derivations.atoms";
import { lovelaceToAdaNumber } from "@/lib/units/lovelace";
import { type WalletActivityEvent } from "@/components/user/workspace/types";

/**
 * The wealth chart plots one point per activity event, and this decides where on the time axis
 * each point goes. It used to fall back to the transaction's slot number when `blockTime` was
 * missing, multiplied by 1000 as if a slot were unix seconds. It is not: a slot counts ticks
 * since the network's own origin. The fixture wallet's slot 131928483 became
 * 1974-03-07T22:48:03.000Z, so the point dropped out of 7D, 30D, 90D and 1Y, and in ALL it
 * stretched the axis across half a century.
 *
 * Render time is an approximation for an untimed event, but a bounded one: the newest point on
 * the chart stays equal to the balance the rest of the app shows.
 */

const RENDER_NOW_MS = 1_756_000_000_000;

test("a timed event plots at its block time", () => {
  assert.equal(seriesPointTimestampMs({ blockTime: 1_755_900_000 }, RENDER_NOW_MS), 1_755_900_000_000);
});

// The fixture wallet's own untimed event, carrying the slot that used to be read as a time.
const UNTIMED_WITH_SLOT: { blockTime?: number | null; slot?: string } = { slot: "131928483" };

test("an untimed event plots at render time, not in 1974", () => {
  for (const transaction of [{}, { blockTime: null }, { blockTime: 0 }, UNTIMED_WITH_SLOT]) {
    const ts = seriesPointTimestampMs(transaction, RENDER_NOW_MS);
    assert.equal(ts, RENDER_NOW_MS);
    assert.ok(
      new Date(ts).getUTCFullYear() > 2000,
      `${new Date(ts).toISOString()} is not a plausible activity time`
    );
  }
});

/**
 * A balance only changes at a transaction, so the series records changes, not days. A wallet
 * with one transaction therefore produced one point, and the chart called one point "not enough
 * activity in this range to draw a chart yet" while showing the funded balance directly above
 * it. Holding the newest value to render time says what the data already says and invents no
 * history.
 */
test("one transaction still draws: the newest balance is held to now", () => {
  const funded = [{ timestamp: RENDER_NOW_MS - 5 * 24 * 60 * 60 * 1000, value: 40 }];

  const held = withCurrentBalanceHeld(funded, RENDER_NOW_MS);

  assert.equal(held.length, 2);
  assert.deepEqual(held[0], funded[0]);
  assert.deepEqual(held[1], { timestamp: RENDER_NOW_MS, value: 40 });
});

test("the held point repeats the last value and never invents one", () => {
  const series = [
    { timestamp: RENDER_NOW_MS - 10_000, value: 10 },
    { timestamp: RENDER_NOW_MS - 5_000, value: 25 }
  ];

  const held = withCurrentBalanceHeld(series, RENDER_NOW_MS);

  assert.equal(held.length, 3);
  assert.equal(held[2]?.value, 25);
});

test("nothing is appended to an empty series or to one already at render time", () => {
  assert.deepEqual(withCurrentBalanceHeld([], RENDER_NOW_MS), []);

  const untimed = [{ timestamp: RENDER_NOW_MS, value: 7 }];
  assert.deepEqual(withCurrentBalanceHeld(untimed, RENDER_NOW_MS), untimed);
});

test("a resolver recomputes the held point instead of repeating the last value", () => {
  const series = [
    { timestamp: RENDER_NOW_MS - 10_000, value: 10 },
    { timestamp: RENDER_NOW_MS - 5_000, value: 25 }
  ];

  const held = withCurrentBalanceHeld(series, RENDER_NOW_MS, () => 21);

  assert.equal(held.length, 3);
  assert.equal(held[2]?.timestamp, RENDER_NOW_MS);
  assert.equal(held[2]?.value, 21);
});

/**
 * The available line carves out what the wallet's streams still owe, and that obligation
 * accrues with time. The held point used to repeat the last event's adjusted value, so a
 * wallet with no recent activity charted a stale available balance until the next
 * transaction happened to refresh it.
 */
test("a creation transaction's event pair is summed once, not twice", () => {
  // The creation tx yields two events ("created" + its "initial top-up") carrying the
  // same inputs and outputs. Summing both drew 10 ADA on a 5 ADA wallet.
  const tx = { blockTime: RENDER_NOW_MS / 1000 - 60, hash: "ab".repeat(32) };
  const fundedOutput = [
    {
      input: { txHash: "cd".repeat(32), outputIndex: 0 },
      output: {
        address: "addr_test1wallet",
        amount: [{ unit: "lovelace", quantity: "50000000" }]
      }
    }
  ];
  const created = {
    id: "created",
    transaction: tx,
    inputUtxos: [],
    outputUtxos: fundedOutput
  } as unknown as WalletActivityEvent;
  const topUp = { ...created, id: "initial-top-up" } as WalletActivityEvent;

  const series = buildAssetWealthSeries(
    [created, topUp],
    "addr_test1wallet",
    RENDER_NOW_MS,
    "lovelace"
  );

  // One point for the transaction plus the held point at render time, and the 50 ADA
  // counted once.
  assert.equal(series.length, 2);
  assert.equal(series[0]!.value, 50);
  assert.equal(series[1]!.value, 50);
});

test("the available line's held point is adjusted at render time, not at the last event", () => {
  const STREAM_START_S = RENDER_NOW_MS / 1000 - 20;
  // One funded transaction ten seconds after the stream began; nothing since.
  const event = {
    id: "e1",
    transaction: { blockTime: STREAM_START_S + 10 },
    inputUtxos: [],
    outputUtxos: [
      {
        input: { txHash: "ab".repeat(32), outputIndex: 0 },
        output: {
          address: "addr_test1wallet",
          amount: [{ unit: "lovelace", quantity: "100000000" }]
        }
      }
    ]
  } as unknown as WalletActivityEvent;
  // The stream owes 1 lovelace per second since it started.
  const adjustRunning = (running: bigint, timestampMs: number) =>
    running - BigInt(Math.max(0, Math.round(timestampMs / 1000 - STREAM_START_S)));

  const series = buildAssetWealthSeries(
    [event],
    "addr_test1wallet",
    RENDER_NOW_MS,
    "lovelace",
    adjustRunning
  );

  // At the transaction: 100 ADA minus 10 lovelace owed. Held at render time: 100 ADA
  // minus the 20 lovelace owed *now* — not the stale 10.
  assert.equal(series.length, 2);
  assert.equal(series[0]!.value, lovelaceToAdaNumber(99_999_990n));
  assert.equal(series[1]!.timestamp, RENDER_NOW_MS);
  assert.equal(series[1]!.value, lovelaceToAdaNumber(99_999_980n));
});
