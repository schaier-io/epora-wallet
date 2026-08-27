import { test } from "node:test";
import assert from "node:assert/strict";

import { seriesPointTimestampMs } from "./workspace-transfer-derivations.atoms";

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
