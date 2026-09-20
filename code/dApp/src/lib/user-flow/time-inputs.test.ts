import assert from "node:assert/strict";
import test from "node:test";

import { defaultTimeZone } from "@/i18n/config";
import {
  combineDateAndTimeToTimestamp,
  splitTimestampToInputParts
} from "@/lib/user-flow/time-inputs";

// A shift back through `getTimezoneOffset()` (what this module used to do) is a no-op
// when the host zone is UTC, and CI runners are UTC, so on a bare runner the assertions
// below would pass with that bug back in place. Pin the host zone away from UTC so the
// two failure modes are distinguishable. Node re-reads `process.env.TZ` on the next
// `Date`, the offset is read per call rather than at load, and the test runner gives
// each file its own process, so this stays local to this file.
process.env.TZ = "Asia/Tokyo";

/**
 * The `date` / `time` halves are produced and read with `toISOString()`, which is UTC,
 * while every label beside them is rendered in `defaultTimeZone`. The two agree only
 * because `defaultTimeZone` is "UTC". Nothing in the module enforces that, so this
 * derives the expected halves from the formatter's own zone: if `defaultTimeZone` ever
 * stops being UTC, the input column desyncs from the labels and this fails. The host
 * zone is pinned away from UTC above so a reintroduced host-zone shift fails too.
 */
function wallClockIn(zone: string, timestamp: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(timestamp);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    time: `${read("hour")}:${read("minute")}`
  };
}

const SAMPLES = [
  Date.UTC(2031, 4, 17, 21, 42),
  Date.UTC(2026, 0, 1, 0, 0),
  Date.UTC(2026, 6, 14, 23, 59)
];

test("the date and time inputs carry the wall clock of defaultTimeZone", () => {
  for (const timestamp of SAMPLES) {
    assert.deepEqual(
      splitTimestampToInputParts(String(timestamp)),
      wallClockIn(defaultTimeZone, timestamp),
      `timestamp ${timestamp} in ${defaultTimeZone}`
    );
  }
});

test("the two halves combine back to the stored timestamp", () => {
  for (const timestamp of SAMPLES) {
    const parts = splitTimestampToInputParts(String(timestamp));
    assert.equal(
      combineDateAndTimeToTimestamp(parts.date, parts.time),
      String(timestamp)
    );
  }
});
