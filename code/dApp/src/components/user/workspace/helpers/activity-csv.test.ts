import { test } from "node:test";
import assert from "node:assert/strict";

import { buildActivityCsv } from "./activity-csv";
import { type WalletActivityEvent } from "@/components/user/workspace/types";

function event(overrides: Partial<WalletActivityEvent> = {}): WalletActivityEvent {
  return {
    id: "e1",
    transaction: {
      hash: "ab".repeat(32),
      fees: "168577",
      blockTime: 1_756_000_000
    } as unknown as WalletActivityEvent["transaction"],
    label: "Top-up",
    title: "Initial top-up",
    badgeClassName: "",
    summary: "Starter funds were added: 5 ADA.",
    amountSummary: "+5 ADA",
    amountClassName: "",
    actorLabel: "eternl",
    actorDetail: "addr_test1qq",
    details: [],
    inputUtxos: [],
    outputUtxos: [],
    ...overrides
  };
}

const formatUtc = (ms: number) => new Date(ms).toISOString();
const formatLocal = (ms: number) => `<local ${ms}>`;

test("one quoted row per event, with both dates and the actor", () => {
  const csv = buildActivityCsv([event()], formatUtc, formatLocal);

  const rows = csv.split("\n");
  assert.equal(rows.length, 2);
  assert.match(rows[0]!, /"Date \(UTC\)","Date \(local\)","Type","Title","Amount","Actor","Fee \(lovelace\)","Tx hash"/);
  assert.match(rows[1]!, /"2025-08-24T01:46:40\.000Z"/);
  assert.match(rows[1]!, /"<local 1756000000000>"/);
  // The leading "+" is formula-bait, so the cell carries the defusing apostrophe.
  assert.match(rows[1]!, /"Top-up","Initial top-up","'\+5 ADA"/);
  assert.match(rows[1]!, /"eternl \(addr_test1qq\)"/);
  assert.match(rows[1]!, /"168577"/);
  assert.match(rows[1]!, new RegExp(`"${"ab".repeat(32)}"`));
});

test("an actor without a detail is not wrapped in empty parentheses", () => {
  const csv = buildActivityCsv([event({ actorDetail: null })], formatUtc, formatLocal);

  assert.match(csv, /"eternl",/);
});

test("a missing block time falls back to the slot approximation or stays empty", () => {
  const dated = event({
    transaction: { hash: "cd", fees: "0", blockTime: undefined, slot: "132574663" } as unknown as WalletActivityEvent["transaction"]
  });
  const csv = buildActivityCsv([dated], formatUtc, formatLocal);
  // The slot converts to a real moment on this network's timeline; the local column
  // receives the same moment.
  assert.match(csv, /"\d{4}-\d{2}-\d{2}T/);

  const undated = event({
    transaction: { hash: "cd", fees: "0", blockTime: undefined, slot: undefined } as unknown as WalletActivityEvent["transaction"]
  });
  const empty = buildActivityCsv([undated], formatUtc, formatLocal);
  assert.match(empty, /"",""/);
});

test("copy that contains quotes, commas, and newlines survives the round trip", () => {
  const hostile = event({
    label: "Sent",
    title: 'Paid "rent", a lot\nreally',
    amountSummary: "1,5 ADA, minus fees"
  });
  const csv = buildActivityCsv([hostile], formatUtc, formatLocal);

  assert.match(csv, /"Paid ""rent"", a lot\nreally"/);
  assert.match(csv, /"1,5 ADA, minus fees"/);
});

test("a value a spreadsheet would read as a formula is defused", () => {
  const hostile = event({ amountSummary: "=1+1", actorLabel: "+gimmick", title: "@cmd" });
  const csv = buildActivityCsv([hostile], formatUtc, formatLocal);

  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"'\+gimmick \(addr_test1qq\)"/);
  assert.match(csv, /"'@cmd"/);
});

test("a timestamp beyond the representable Date range exports as undated", () => {
  const ancient = event({
    transaction: {
      hash: "cd",
      fees: "0",
      blockTime: 8_640_000_000_000_001
    } as unknown as WalletActivityEvent["transaction"]
  });

  // 8.64e15 ms throws on `new Date(ms).toISOString()`; the row must stay exportable.
  const csv = buildActivityCsv([ancient], formatUtc, formatLocal);
  assert.match(csv, /"",""/);
});

test("an empty feed is just the header row", () => {
  const csv = buildActivityCsv([], formatUtc, formatLocal);

  assert.equal(csv.split("\n").length, 1);
  assert.match(csv, /"Tx hash"/);
});
