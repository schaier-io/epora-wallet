import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";

import {
  buildAvailableAssetWealthSeries,
  buildAssetWealthSeries,
  seriesPointTimestampMs,
  streamingPaymentPayoutRowsAtom,
  subtractAccruedScheduledPayments,
  withCurrentBalanceHeld
} from "./workspace-transfer-derivations.atoms";
import { sttStateFormAtom } from "./forms/stt-spend-form.atoms";
import { renderNowMsAtom } from "./workspace-ui.atoms";
import {
  createDefaultStateForm,
  createDefaultStreamingPaymentFormState,
  stateFormToDatum,
  type StreamingPaymentFormState
} from "@/lib/contracts/state-form";
import { lovelaceToAdaNumber } from "@/lib/units/lovelace";
import { type WalletActivityEvent } from "@/components/user/workspace/types";
import { serializeData } from "@meshsdk/core";

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
const DAY_MS = 86_400_000;

function streamingPayment(
  overrides: Partial<StreamingPaymentFormState> = {}
): StreamingPaymentFormState {
  return {
    ...createDefaultStreamingPaymentFormState("1"),
    payoutAddress: "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6",
    amountPerDay: "1000000",
    startDate: "0",
    endDate: String(10 * DAY_MS),
    ...overrides
  };
}

const CHART_WALLET_ADDRESS = "addr_test1wallet";
const CHART_STATE_ADDRESS = "addr_test1wstate";
const CHART_STT_UNIT = `${"ab".repeat(28)}01`;

function chartState(paidOutAmount: string) {
  const state = createDefaultStateForm();
  state.streamingPayments = [streamingPayment({ paidOutAmount })];
  return state;
}

function historicalChartEvent({
  txHash,
  blockTime,
  transactionIndex,
  walletOutputLovelace = "0",
  state
}: {
  txHash: string;
  blockTime?: number;
  transactionIndex: number;
  walletOutputLovelace?: string;
  state?: ReturnType<typeof createDefaultStateForm> | null;
}): WalletActivityEvent {
  return {
    id: txHash,
    transaction: { hash: txHash, blockTime, index: transactionIndex },
    inputUtxos: [],
    outputUtxos: [
      ...(BigInt(walletOutputLovelace) > 0n
        ? [{
            input: { txHash, outputIndex: 0 },
            output: {
              address: CHART_WALLET_ADDRESS,
              amount: [{ unit: "lovelace", quantity: walletOutputLovelace }]
            }
          }]
        : []),
      ...(typeof state === "undefined"
        ? []
        : [{
            input: { txHash, outputIndex: 1 },
            output: {
              address: CHART_STATE_ADDRESS,
              amount: [{ unit: CHART_STT_UNIT, quantity: "1" }],
              ...(state
                ? { plutusData: serializeData(stateFormToDatum(state), "Mesh") }
                : {})
            }
          }])
    ]
  } as unknown as WalletActivityEvent;
}

test("available balance subtracts only the five ADA accrued by day five", () => {
  assert.equal(
    subtractAccruedScheduledPayments(
      25_000_000n,
      [streamingPayment()],
      "lovelace",
      5 * DAY_MS
    ),
    20_000_000n
  );
});

test("a future scheduled payment does not reduce the current balance", () => {
  assert.equal(
    subtractAccruedScheduledPayments(
      25_000_000n,
      [streamingPayment({ startDate: String(6 * DAY_MS), endDate: String(10 * DAY_MS) })],
      "lovelace",
      5 * DAY_MS
    ),
    25_000_000n
  );
});

test("amounts already paid reduce the accrued unpaid amount", () => {
  assert.equal(
    subtractAccruedScheduledPayments(
      25_000_000n,
      [streamingPayment({ paidOutAmount: "3000000" })],
      "lovelace",
      5 * DAY_MS
    ),
    23_000_000n
  );
});

test("multiple matching scheduled payments add their accrued unpaid amounts", () => {
  assert.equal(
    subtractAccruedScheduledPayments(
      25_000_000n,
      [
        streamingPayment(),
        streamingPayment({ id: "2", amountPerDay: "400000" })
      ],
      "lovelace",
      5 * DAY_MS
    ),
    18_000_000n
  );
});

test("a scheduled payment in another asset does not reduce ADA", () => {
  assert.equal(
    subtractAccruedScheduledPayments(
      25_000_000n,
      [streamingPayment({ policyId: "ab".repeat(28), assetName: "01" })],
      "lovelace",
      5 * DAY_MS
    ),
    25_000_000n
  );
});

test("a day-two point keeps two accrued ADA after a day-three payout", () => {
  const sttUnit = `${"ab".repeat(28)}01`;
  const walletAddress = "addr_test1wallet";
  const stateAddress = "addr_test1wstate";
  const stateAtDayTwo = createDefaultStateForm();
  stateAtDayTwo.streamingPayments = [streamingPayment()];
  const stateAfterDayThreePayout = createDefaultStateForm();
  stateAfterDayThreePayout.streamingPayments = [
    streamingPayment({ paidOutAmount: "3000000" })
  ];
  const stateOutput = (
    txHash: string,
    state: ReturnType<typeof createDefaultStateForm>
  ) => ({
    input: { txHash, outputIndex: 0 },
    output: {
      address: stateAddress,
      amount: [{ unit: sttUnit, quantity: "1" }],
      plutusData: serializeData(stateFormToDatum(state), "Mesh")
    }
  });
  const event = (
    day: number,
    walletInput: bigint,
    walletOutput: bigint,
    state: ReturnType<typeof createDefaultStateForm> | null
  ) => {
    const txHash = day.toString(16).padStart(64, "0");
    return {
      id: `day-${day}`,
      transaction: { hash: txHash, blockTime: (day * DAY_MS) / 1000 },
      inputUtxos: walletInput > 0n
        ? [{
            input: { txHash: "ff".repeat(32), outputIndex: day },
            output: {
              address: walletAddress,
              amount: [{ unit: "lovelace", quantity: walletInput.toString() }]
            }
          }]
        : [],
      outputUtxos: [
        ...(walletOutput > 0n
          ? [{
              input: { txHash, outputIndex: 1 },
              output: {
                address: walletAddress,
                amount: [{ unit: "lovelace", quantity: walletOutput.toString() }]
              }
            }]
          : []),
        ...(state ? [stateOutput(txHash, state)] : [])
      ]
    } as unknown as WalletActivityEvent;
  };

  const series = buildAvailableAssetWealthSeries(
    [
      event(1, 0n, 25_000_000n, stateAtDayTwo),
      event(2, 0n, 0n, null),
      event(3, 25_000_000n, 22_000_000n, stateAfterDayThreePayout)
    ],
    walletAddress,
    4 * DAY_MS,
    "lovelace",
    sttUnit,
    stateAfterDayThreePayout.streamingPayments
  );

  assert.equal(series.find((point) => point.timestamp === 2 * DAY_MS)?.value, 23);
  assert.equal(series.at(-1)?.value, 21);
});

test("history before the first decoded State shows zero available", () => {
  const event = {
    id: "before-state",
    transaction: { hash: "ab".repeat(32), blockTime: DAY_MS / 1000 },
    inputUtxos: [],
    outputUtxos: [{
      input: { txHash: "ab".repeat(32), outputIndex: 0 },
      output: {
        address: "addr_test1wallet",
        amount: [{ unit: "lovelace", quantity: "25000000" }]
      }
    }]
  } as unknown as WalletActivityEvent;

  const series = buildAvailableAssetWealthSeries(
    [event],
    "addr_test1wallet",
    2 * DAY_MS,
    "lovelace",
    `${"ab".repeat(28)}01`,
    []
  );

  assert.equal(series[0]?.value, 0);
  assert.equal(series[1]?.value, 25);
});

test("an untimed historical event decodes its own continuing State", () => {
  const historicalState = chartState("0");
  const currentState = chartState("5000000");
  const series = buildAvailableAssetWealthSeries(
    [historicalChartEvent({
      txHash: "11".repeat(32),
      transactionIndex: 0,
      walletOutputLovelace: "25000000",
      state: historicalState
    })],
    CHART_WALLET_ADDRESS,
    5 * DAY_MS,
    "lovelace",
    CHART_STT_UNIT,
    currentState.streamingPayments
  );

  assert.equal(series.length, 1);
  assert.equal(series[0]?.timestamp, 5 * DAY_MS);
  assert.equal(series[0]?.value, 20);
});

test("an untimed State output with no datum uses conservative unknown history", () => {
  const currentState = chartState("5000000");
  const series = buildAvailableAssetWealthSeries(
    [historicalChartEvent({
      txHash: "22".repeat(32),
      transactionIndex: 0,
      walletOutputLovelace: "25000000",
      state: null
    })],
    CHART_WALLET_ADDRESS,
    5 * DAY_MS,
    "lovelace",
    CHART_STT_UNIT,
    currentState.streamingPayments
  );

  assert.equal(series.length, 1);
  assert.equal(series[0]?.value, 0);
});

test("same-block State transitions follow transaction index before carry-forward", () => {
  const beforePayout = chartState("0");
  const afterPayout = chartState("2000000");
  const blockTime = (2 * DAY_MS) / 1000;
  const series = buildAvailableAssetWealthSeries(
    [
      historicalChartEvent({
        txHash: "33".repeat(32),
        blockTime: (3 * DAY_MS) / 1000,
        transactionIndex: 0
      }),
      historicalChartEvent({
        txHash: "44".repeat(32),
        blockTime,
        transactionIndex: 1,
        state: afterPayout
      }),
      historicalChartEvent({
        txHash: "55".repeat(32),
        blockTime,
        transactionIndex: 0,
        walletOutputLovelace: "25000000",
        state: beforePayout
      })
    ],
    CHART_WALLET_ADDRESS,
    4 * DAY_MS,
    "lovelace",
    CHART_STT_UNIT,
    afterPayout.streamingPayments
  );

  assert.equal(series.find((point) => point.timestamp === 3 * DAY_MS)?.value, 24);
});

test("scheduled payout defaults select every due payment", () => {
  const store = createStore();
  const state = createDefaultStateForm();
  state.streamingPayments = [1, 2, 3].map((id) => ({
    ...createDefaultStreamingPaymentFormState(String(id)),
    amountPerDay: "1000000",
    endDate: String(10 * 86_400_000)
  }));
  store.set(sttStateFormAtom, state);
  store.set(renderNowMsAtom, 86_400_000);

  const rows = store.get(streamingPaymentPayoutRowsAtom);
  assert.deepEqual(
    rows.map((row) => row.configuredAmount !== "0"),
    [true, true, true]
  );
});

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
