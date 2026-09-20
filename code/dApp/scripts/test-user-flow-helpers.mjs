// Plain-node smoke check for the pure user-flow helpers in src/lib/user-flow
// and the lovelace formatting in src/lib/units/lovelace. Run:
//   pnpm test:user-flow-helpers
// (equivalent to: node --import tsx scripts/test-user-flow-helpers.mjs)
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Load the .ts helpers through createRequire, the way sentry-forward.test.ts
// loads the Sentry SDK: an ESM import of CJS-transpiled .ts depends on the
// Node version's export detection (the CI runner's Node 24 does not see
// exports that Node 25 does, through named imports or the namespace object),
// while require returns the real module.exports on every version.
const require = createRequire(import.meta.url);

const {
  chooseAutoOpenDetectedWallet,
  derivePermissionWalletBadgeLabels,
  deriveWalletHomeFlowAvailability,
  filterGuidedUserActions,
  rememberRecentRecipient,
  resolveAutomaticSendPath
} = require("../src/lib/user-flow/guided-helpers.ts");
const {
  combineDurationToMillis,
  combineLocalDateAndTimeToTimestamp,
  splitDurationMillis,
  splitTimestampToLocalInputParts
} = require("../src/lib/user-flow/time-inputs.ts");
const { requestedTransferAssets } = require("../src/lib/user-flow/asset-quantities.ts");
const {
  buildStreamingPaymentPayoutTransfer,
  computeStreamingPaymentDueAmount
} = require("../src/lib/user-flow/streaming-payment-helpers.ts");
const { suggestWalletInputsForRequestedAssets } = require("../src/lib/user-flow/wallet-input-selection.ts");
const {
  formatLovelaceAsAda,
  formatLovelaceAsAdaRounded,
  parseAdaToLovelace
} = require("../src/lib/units/lovelace.ts");

function capabilityMap(overrides = {}) {
  return {
    hasAdminPath: false,
    hasDirectAdminSigner: false,
    hasMultisigPath: false,
    hasDirectUserMatch: false,
    hasDirectAllowance: false,
    hasDirectProofOfLifeRenewalMatch: false,
    hasBeneficiaryMatch: false,
    hasStreamingPayments: false,
    hasLockedUtxos: false,
    lockedUtxosLoading: false,
    availableOperatorPaths: [],
    availableConsolidatePaths: [],
    ...overrides
  };
}

const timestamp = combineLocalDateAndTimeToTimestamp("2026-04-06", "14:30");
assert.match(timestamp, /^\d+$/);
assert.deepEqual(splitTimestampToLocalInputParts(timestamp), {
  date: "2026-04-06",
  time: "14:30"
});

assert.equal(formatLovelaceAsAda("5500000"), "5.5");
assert.equal(formatLovelaceAsAdaRounded("9299375757"), "9,299.3");
assert.equal(formatLovelaceAsAdaRounded("15000000"), "15");
assert.equal(parseAdaToLovelace("5.5"), "5500000");
assert.equal(parseAdaToLovelace("1.234567"), "1234567");

assert.equal(combineDurationToMillis("3", "days"), "259200000");
assert.deepEqual(splitDurationMillis("259200000"), {
  amount: "3",
  unit: "days"
});
assert.deepEqual(splitDurationMillis("61000"), {
  amount: "61000",
  unit: "milliseconds"
});

assert.deepEqual(
  filterGuidedUserActions([
    { kind: "mint" },
    { kind: "update-state" },
    { kind: "manage-streaming-payments" },
    { kind: "wallet-withdraw" },
    { kind: "use-beneficiary" }
  ]),
  [
    { kind: "mint" },
    { kind: "update-state" },
    { kind: "manage-streaming-payments" },
    { kind: "use-beneficiary" }
  ]
);

assert.deepEqual(
  rememberRecentRecipient(["addr2", "addr1"], "addr3"),
  ["addr3", "addr2", "addr1"]
);
assert.deepEqual(
  rememberRecentRecipient(["addr2", "addr1"], "addr1"),
  ["addr1", "addr2"]
);
assert.equal(
  chooseAutoOpenDetectedWallet([{ unit: "one" }]),
  "one"
);
assert.equal(
  chooseAutoOpenDetectedWallet([{ unit: "one" }, { unit: "two" }]),
  null
);
assert.deepEqual(
  derivePermissionWalletBadgeLabels(
    capabilityMap({
      hasDirectAdminSigner: true,
      hasDirectAllowance: true,
      hasBeneficiaryMatch: true,
      hasStreamingPayments: true
    })
  ),
  ["Owner", "Allowance", "Recovery", "Scheduled"]
);
assert.equal(
  resolveAutomaticSendPath(
    capabilityMap({
      hasAdminPath: true,
      hasDirectAdminSigner: true,
      hasLockedUtxos: true,
      availableOperatorPaths: ["admin"],
      availableConsolidatePaths: ["admin"]
    })
  ),
  "use"
);
assert.equal(
  resolveAutomaticSendPath(capabilityMap({ hasDirectAllowance: true })),
  "use-allowance"
);
assert.equal(
  resolveAutomaticSendPath(capabilityMap({ hasBeneficiaryMatch: true })),
  "use-beneficiary"
);
assert.equal(resolveAutomaticSendPath(null), "use");
assert.deepEqual(
  deriveWalletHomeFlowAvailability(
    capabilityMap({
      hasAdminPath: true,
      hasMultisigPath: true,
      hasStreamingPayments: true,
      hasLockedUtxos: true,
      availableOperatorPaths: ["multisig"],
      availableConsolidatePaths: ["multisig"]
    })
  ),
  {
    canSend: true,
    canAddFunds: true,
    canManagePeople: true,
    canManageSettings: true,
    canPayStreamingPayments: true,
    canManageStreamingPayments: true
  }
);

const suggestedRefs = suggestWalletInputsForRequestedAssets(
  [
    {
      input: { txHash: "a".repeat(64), outputIndex: 0 },
      output: {
        address: "addr_test1...",
        amount: [
          { unit: "lovelace", quantity: "3000000" },
          { unit: "token", quantity: "2" }
        ]
      }
    },
    {
      input: { txHash: "b".repeat(64), outputIndex: 1 },
      output: {
        address: "addr_test1...",
        amount: [{ unit: "lovelace", quantity: "4000000" }]
      }
    }
  ],
  [
    { unit: "lovelace", quantity: "5000000" },
    { unit: "token", quantity: "1" }
  ]
);
assert.deepEqual(suggestedRefs, [
  { txHash: "a".repeat(64), outputIndex: 0 },
  { txHash: "b".repeat(64), outputIndex: 1 }
]);

const scheduledPayment = {
  id: "7",
  payoutAddress: "addr_test1...",
  paidOutAmount: "0",
  policyId: "",
  assetName: "",
  amountPerDay: "1000000",
  startDate: "0",
  endDate: "172800000"
};
const dueAmount = computeStreamingPaymentDueAmount(scheduledPayment, 86_400_000);
assert.equal(dueAmount, "1000000");

const payoutTransfer = buildStreamingPaymentPayoutTransfer(
  scheduledPayment,
  "1000000",
  "c".repeat(64),
  2
);
assert.deepEqual(requestedTransferAssets([payoutTransfer]), [
  { unit: "lovelace", quantity: "1000000" }
]);
assert.equal(payoutTransfer.inlineDatum.alternative, 0);
assert.deepEqual(payoutTransfer.inlineDatum.fields, [7, "c".repeat(64), 2]);

console.log("user-flow helper smoke checks passed");
