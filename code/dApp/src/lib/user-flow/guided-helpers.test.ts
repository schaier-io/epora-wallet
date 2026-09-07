import assert from "node:assert/strict";
import { test } from "node:test";
import type { UTxO } from "@meshsdk/core";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import type { Asset } from "@/lib/types/contracts";
import {
  resolveAutomaticSendPath,
  computeStreamingPaymentDueAmount,
  computeStreamingPaymentLifetimeAmount,
  computeStreamingPaymentRemainingObligation,
  computeStreamingReserveAssets,
  maximumAdaSpendWithChange,
  parseAdaToLovelace,
  streamingPaymentNeedsZeroDeltaCleanup,
  streamingPaymentUnit,
  suggestLockedInputsForSpend,
  suggestWalletInputsForRequestedAssets
} from "@/lib/user-flow/guided-helpers";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";

const DAY_MS = 86_400_000;
const WALLET_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const NATIVE_UNIT = `${"ab".repeat(28)}01`;
const STAKED_WALLET_ADDRESS =
  "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59";

function streamingPayment(over: Partial<StreamingPaymentFormState>): StreamingPaymentFormState {
  return {
    id: "1",
    payoutAddress: "addr_test1xyz",
    paidOutAmount: "0",
    policyId: "",
    assetName: "",
    amountPerDay: "1000000",
    startDate: "0",
    endDate: String(10 * DAY_MS),
    ...over
  };
}

function utxo(txHash: string, amount: Asset[]): UTxO {
  return {
    input: { txHash, outputIndex: 0 },
    output: { address: WALLET_ADDRESS, amount }
  };
}

test("parseAdaToLovelace converts whole, fractional, and comma-grouped ADA", () => {
  assert.equal(parseAdaToLovelace("1"), "1000000");
  assert.equal(parseAdaToLovelace("1.5"), "1500000");
  assert.equal(parseAdaToLovelace("0.000001"), "1"); // one lovelace
  assert.equal(parseAdaToLovelace("1,000"), "1000000000");
  assert.equal(parseAdaToLovelace("  2  "), "2000000"); // trimmed
});

test("parseAdaToLovelace rejects junk and over-precise input", () => {
  assert.equal(parseAdaToLovelace("1.1234567"), null); // > 6 decimals
  assert.equal(parseAdaToLovelace("abc"), null);
  assert.equal(parseAdaToLovelace(""), null);
  assert.equal(parseAdaToLovelace(".5"), "500000"); // a leading dot is a decimal, not junk
});

test("computeStreamingPaymentDueAmount accrues linearly and caps at the end date", () => {
  const sp = streamingPayment({ amountPerDay: "1000000", startDate: "0", endDate: String(10 * DAY_MS) });

  // Halfway through: 5 of 10 days at 1 ADA/day.
  assert.equal(computeStreamingPaymentDueAmount(sp, 5 * DAY_MS), "5000000");
  // At the end: full 10 ADA.
  assert.equal(computeStreamingPaymentDueAmount(sp, 10 * DAY_MS), "10000000");
  // Past the end: still capped at the end date, not unbounded.
  assert.equal(computeStreamingPaymentDueAmount(sp, 999 * DAY_MS), "10000000");
});

test("computeStreamingPaymentDueAmount returns 0 before start and when fully paid", () => {
  const future = streamingPayment({ startDate: String(100 * DAY_MS), endDate: String(200 * DAY_MS) });
  assert.equal(computeStreamingPaymentDueAmount(future, 50 * DAY_MS), "0");

  const paid = streamingPayment({ endDate: String(10 * DAY_MS), paidOutAmount: "10000000" });
  assert.equal(computeStreamingPaymentDueAmount(paid, 10 * DAY_MS), "0");
});

test("computeStreamingPaymentRemainingObligation encumbers the whole stream, then decays to the unpaid remainder", () => {
  const sp = streamingPayment({ amountPerDay: "1000000", startDate: "0", endDate: String(10 * DAY_MS), paidOutAmount: "3000000" });

  // Before the start: nothing has accrued, so the full lifetime is still owed.
  assert.equal(computeStreamingPaymentRemainingObligation(sp, 0), "10000000");
  // Halfway: 3 ADA already paid out, so 7 ADA of the lifetime is still encumbered
  // (1 ADA accrued-unpaid plus the 6 ADA that will still accrue).
  assert.equal(computeStreamingPaymentRemainingObligation(sp, 5 * DAY_MS), "7000000");
  // Past the end: accrual is done and only the unpaid remainder stays owed.
  assert.equal(computeStreamingPaymentRemainingObligation(sp, 999 * DAY_MS), "7000000");
  // Fully paid and past the end: nothing is owed.
  const settled = streamingPayment({ paidOutAmount: "10000000" });
  assert.equal(computeStreamingPaymentRemainingObligation(settled, 999 * DAY_MS), "0");
  // A historical midpoint reads the schedule, not the payout history: it still
  // counts the not-yet-accrued remainder as encumbered at that point even when the
  // stream has since been settled.
  assert.equal(computeStreamingPaymentRemainingObligation(settled, 5 * DAY_MS), "5000000");
});

test("computeStreamingReserveAssets mirrors the per-asset accrued reserve", () => {
  const tokenPolicy = "aa".repeat(28);
  const reserves = computeStreamingReserveAssets(
    [
      streamingPayment({ amountPerDay: "1000000", endDate: String(3 * DAY_MS) }),
      streamingPayment({
        id: "2",
        amountPerDay: "500000",
        paidOutAmount: "100000",
        endDate: String(3 * DAY_MS)
      }),
      streamingPayment({
        id: "3",
        policyId: tokenPolicy,
        assetName: "beef",
        amountPerDay: "7",
        endDate: String(3 * DAY_MS)
      })
    ],
    DAY_MS
  );

  assert.deepEqual(reserves, [
    { unit: "lovelace", quantity: "1400002" },
    { unit: `${tokenPolicy}beef`, quantity: "8" }
  ]);
});

test("streamingPaymentUnit maps an empty policy id to lovelace and otherwise concatenates", () => {
  assert.equal(streamingPaymentUnit(streamingPayment({})), "lovelace");
  assert.equal(
    streamingPaymentUnit(streamingPayment({ policyId: "abc123", assetName: "def" })),
    "abc123def"
  );
});

test("streaming payment cleanup detects fully settled and floor-rounded schedules", () => {
  const settled = streamingPayment({ paidOutAmount: "10000000" });
  assert.equal(computeStreamingPaymentLifetimeAmount(settled), "10000000");
  assert.equal(streamingPaymentNeedsZeroDeltaCleanup(settled), true);

  const partial = streamingPayment({ paidOutAmount: "9999999" });
  assert.equal(streamingPaymentNeedsZeroDeltaCleanup(partial), false);

  const floorRoundedToZero = streamingPayment({
    amountPerDay: "1",
    endDate: "1",
    paidOutAmount: "0"
  });
  assert.equal(computeStreamingPaymentLifetimeAmount(floorRoundedToZero), "0");
  assert.equal(streamingPaymentNeedsZeroDeltaCleanup(floorRoundedToZero), true);

  const zeroDuration = streamingPayment({
    amountPerDay: "86400000000000",
    startDate: String(DAY_MS),
    endDate: String(DAY_MS),
    paidOutAmount: "0"
  });
  assert.equal(computeStreamingPaymentLifetimeAmount(zeroDuration), "0");
  assert.equal(streamingPaymentNeedsZeroDeltaCleanup(zeroDuration), true);
});

test("suggestWalletInputsForRequestedAssets selects a single covering UTxO", () => {
  const utxos = [utxo("aa", [{ unit: "lovelace", quantity: "5000000" }])];
  const selected = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "5000000" }
  ]);
  assert.deepEqual(selected, [{ txHash: "aa", outputIndex: 0 }]);
});

test("suggestWalletInputsForRequestedAssets combines multiple UTxOs to cover the request", () => {
  const utxos = [
    utxo("aa", [{ unit: "lovelace", quantity: "5000000" }]),
    utxo("bb", [{ unit: "lovelace", quantity: "5000000" }])
  ];
  const selected = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "8000000" }
  ]);
  assert.equal(selected.length, 2);
});

test("suggestWalletInputsForRequestedAssets returns [] when the request cannot be funded", () => {
  const utxos = [utxo("aa", [{ unit: "lovelace", quantity: "5000000" }])];
  const selected = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "10000000" }
  ]);
  assert.deepEqual(selected, []);
});

test("suggestWalletInputsForRequestedAssets covers lovelace and a native asset together", () => {
  const utxos = [
    utxo("aa", [
      { unit: "lovelace", quantity: "3000000" },
      { unit: "policytoken", quantity: "10" }
    ])
  ];
  const selected = suggestWalletInputsForRequestedAssets(utxos, [
    { unit: "lovelace", quantity: "2000000" },
    { unit: "policytoken", quantity: "5" }
  ]);
  assert.deepEqual(selected, [{ txHash: "aa", outputIndex: 0 }]);
});

test("suggestLockedInputsForSpend returns nothing when no assets are requested", () => {
  const utxos = [utxo("aa", [{ unit: "lovelace", quantity: "5000000" }])];
  assert.deepEqual(
    suggestLockedInputsForSpend(
      utxos,
      [],
      [{ unit: "lovelace", quantity: "1000000" }]
    ),
    []
  );
  assert.deepEqual(suggestLockedInputsForSpend(utxos, [], []), []);
});

test("suggestLockedInputsForSpend selects one covering pool", () => {
  const utxos = [
    utxo("aa", [{ unit: "lovelace", quantity: "5000000" }]),
    utxo("bb", [{ unit: "lovelace", quantity: "25000000" }])
  ];
  assert.deepEqual(
    suggestLockedInputsForSpend(
      utxos,
      [{ unit: "lovelace", quantity: "3000000" }],
      [{ unit: "lovelace", quantity: "10000000" }]
    ),
    [{ txHash: "bb", outputIndex: 0 }]
  );
});

test("suggestLockedInputsForSpend uses each asset's exact reserve", () => {
  const utxos = [
    utxo("aa", [
      { unit: "lovelace", quantity: "10000000" },
      { unit: NATIVE_UNIT, quantity: "6000000" }
    ]),
    utxo("bb", [
      { unit: "lovelace", quantity: "8000000" },
      { unit: NATIVE_UNIT, quantity: "9000000" }
    ])
  ];

  assert.deepEqual(
    suggestLockedInputsForSpend(
      utxos,
      [
        { unit: "lovelace", quantity: "2000000" },
        { unit: NATIVE_UNIT, quantity: "2000000" }
      ],
      [
        { unit: "lovelace", quantity: "5000000" },
        { unit: NATIVE_UNIT, quantity: "5000000" }
      ]
    ),
    [{ txHash: "bb", outputIndex: 0 }]
  );
});

test("suggestLockedInputsForSpend combines pools that cover the request", () => {
  const utxos = [
    utxo("aa", [{ unit: "lovelace", quantity: "5000000" }]),
    utxo("bb", [{ unit: "lovelace", quantity: "5000000" }])
  ];
  assert.deepEqual(
    suggestLockedInputsForSpend(
      utxos,
      [{ unit: "lovelace", quantity: "8000000" }],
      []
    ),
    [
      { txHash: "aa", outputIndex: 0 },
      { txHash: "bb", outputIndex: 0 }
    ]
  );
});

test("suggestLockedInputsForSpend keeps minimum ADA with native-token change", () => {
  const tokenPool = utxo("aa", [
    { unit: "lovelace", quantity: "5000000" },
    { unit: NATIVE_UNIT, quantity: "1" }
  ]);
  tokenPool.output.address = WALLET_ADDRESS;
  const extraPool = utxo("bb", [{ unit: "lovelace", quantity: "2000000" }]);
  const largerPool = utxo("cc", [{ unit: "lovelace", quantity: "3000000" }]);
  const smallerTokenPool = utxo("dd", [
    { unit: "lovelace", quantity: "1500000" },
    { unit: `${"cd".repeat(28)}01`, quantity: "1" }
  ]);

  assert.deepEqual(
    suggestLockedInputsForSpend(
      [tokenPool, smallerTokenPool, largerPool, extraPool],
      [{ unit: "lovelace", quantity: "5000000" }]
    ),
    [tokenPool.input, extraPool.input]
  );
  assert.deepEqual(
    suggestLockedInputsForSpend(
      [tokenPool],
      [{ unit: "lovelace", quantity: "5000000" }]
    ),
    []
  );
});

test("suggestLockedInputsForSpend funds positive ADA-only change above its minimum", () => {
  const mainPool = utxo("aa", [{ unit: "lovelace", quantity: "5000000" }]);
  const extraPool = utxo("bb", [{ unit: "lovelace", quantity: "2000000" }]);
  const spend = [{ unit: "lovelace", quantity: "4500000" }];
  assert.deepEqual(
    suggestLockedInputsForSpend([mainPool, extraPool], spend),
    [mainPool.input, extraPool.input]
  );
  assert.deepEqual(suggestLockedInputsForSpend([mainPool], spend), []);
});

test("suggestLockedInputsForSpend sizes change at the canonical continuing address", () => {
  const mainPool = utxo("aa", [
    { unit: "lovelace", quantity: "5000000" },
    { unit: NATIVE_UNIT, quantity: "1" }
  ]);
  const extraPool = utxo("bb", [{ unit: "lovelace", quantity: "2000000" }]);
  const spend = [{ unit: "lovelace", quantity: "3900000" }];
  assert.deepEqual(
    suggestLockedInputsForSpend([mainPool, extraPool], spend),
    [mainPool.input]
  );
  assert.deepEqual(
    suggestLockedInputsForSpend([mainPool, extraPool], spend, [], STAKED_WALLET_ADDRESS),
    [mainPool.input, extraPool.input]
  );
});

test("maximumAdaSpendWithChange retains its exact minimum above Number.MAX_SAFE_INTEGER", () => {
  const pool = utxo("aa", [
    { unit: "lovelace", quantity: MAX_ON_CHAIN_STATE_INTEGER.toString() },
    { unit: NATIVE_UNIT, quantity: "1" }
  ]);
  assert.equal(
    maximumAdaSpendWithChange([pool], MAX_ON_CHAIN_STATE_INTEGER),
    MAX_ON_CHAIN_STATE_INTEGER - 1_008_540n
  );
  assert.equal(
    maximumAdaSpendWithChange([pool], MAX_ON_CHAIN_STATE_INTEGER, STAKED_WALLET_ADDRESS),
    MAX_ON_CHAIN_STATE_INTEGER - 1_129_220n
  );
});

test("suggestLockedInputsForSpend uses one pool when it covers the aggregate requirement", () => {
  const utxos = [
    utxo("aa", [{ unit: "lovelace", quantity: "5000000" }]),
    utxo("bb", [{ unit: "lovelace", quantity: "25000000" }])
  ];
  const result = suggestLockedInputsForSpend(
    utxos,
    [{ unit: "lovelace", quantity: "3000000" }],
    []
  );
  assert.equal(result.length, 1); // one pool already covers a 3 ADA payout
});

test("suggestLockedInputsForSpend combines pools and preserves the aggregate reserve", () => {
  const utxos = [
    utxo("aa", [{ unit: "lovelace", quantity: "5000000" }]),
    utxo("bb", [{ unit: "lovelace", quantity: "5000000" }])
  ];

  assert.deepEqual(
    suggestLockedInputsForSpend(
      utxos,
      [{ unit: "lovelace", quantity: "4000000" }],
      [{ unit: "lovelace", quantity: "6000000" }]
    ),
    [
      { txHash: "aa", outputIndex: 0 },
      { txHash: "bb", outputIndex: 0 }
    ]
  );
});

test("suggestLockedInputsForSpend rejects an aggregate reserve shortfall", () => {
  const utxos = [
    utxo("aa", [{ unit: "lovelace", quantity: "5000000" }]),
    utxo("bb", [{ unit: "lovelace", quantity: "4999999" }])
  ];

  assert.deepEqual(
    suggestLockedInputsForSpend(
      utxos,
      [{ unit: "lovelace", quantity: "4000000" }],
      [{ unit: "lovelace", quantity: "6000000" }]
    ),
    []
  );
});

test("suggestLockedInputsForSpend keeps valid aggregate requirements above uint64", () => {
  const utxos = [
    utxo("aa", [
      { unit: "lovelace", quantity: MAX_ON_CHAIN_STATE_INTEGER.toString() }
    ]),
    utxo("bb", [{ unit: "lovelace", quantity: "2000000" }])
  ];

  assert.deepEqual(
    suggestLockedInputsForSpend(
      utxos,
      [{ unit: "lovelace", quantity: MAX_ON_CHAIN_STATE_INTEGER.toString() }],
      [{ unit: "lovelace", quantity: "1" }]
    ),
    [
      { txHash: "aa", outputIndex: 0 },
      { txHash: "bb", outputIndex: 0 }
    ]
  );
});


test("guided beneficiary sending retains final recovery access", () => {
  assert.equal(resolveAutomaticSendPath({
    hasAdminPath: false, hasDirectAdminSigner: false, hasMultisigPath: false,
    hasDirectUserMatch: false, hasDirectProofOfLifeRenewalMatch: false,
    hasDirectAllowance: false,
    hasBeneficiaryMatch: true, hasStreamingPayments: false,
    hasLockedUtxos: true, lockedUtxosLoading: false,
    availableOperatorPaths: [], availableConsolidatePaths: ["beneficiary"]
  }), "use-beneficiary");
});
