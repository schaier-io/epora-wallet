import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const frontendRoot = path.resolve(process.cwd());
const helperPath = path.join(frontendRoot, "src/lib/user-flow/guided-helpers.ts");
const helperSource = await fs.readFile(helperPath, "utf8");
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022
  },
  fileName: helperPath
}).outputText;

const helperModuleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const helpers = await import(helperModuleUrl);

const {
  GUIDED_USER_ACTION_KINDS,
  buildSubscriptionPayoutTransfer,
  combineDurationToMillis,
  combineLocalDateAndTimeToTimestamp,
  computeSubscriptionDueAmount,
  chooseAutoOpenDetectedWallet,
  deriveWalletHomeFlowAvailability,
  derivePermissionWalletBadgeLabels,
  filterGuidedUserActions,
  formatLovelaceAsAda,
  formatLovelaceAsAdaRounded,
  parseAdaToLovelace,
  rememberRecentRecipient,
  resolveAutomaticSendPath,
  requestedTransferAssets,
  shouldShowCompactAssetSearch,
  splitDurationMillis,
  splitTimestampToLocalInputParts,
  summarizeAssetKinds,
  summarizePeopleSection,
  summarizeSettingsSection,
  summarizeSubscriptionsSection,
  summarizeWalletHoldings,
  suggestWalletInputsForRequestedAssets
} = helpers;

const timestamp = combineLocalDateAndTimeToTimestamp("2026-04-06", "14:30");
assert.match(timestamp, /^\d+$/);
assert.deepEqual(splitTimestampToLocalInputParts(timestamp), {
  date: "2026-04-06",
  time: "14:30"
});

assert.equal(formatLovelaceAsAda("5500000"), "5.5");
assert.equal(formatLovelaceAsAdaRounded("9299375757"), "9,299.4");
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
    { kind: "manage-subscriptions" },
    { kind: "wallet-withdraw" },
    { kind: "use-beneficiary" }
  ]),
  [
    { kind: "mint" },
    { kind: "update-state" },
    { kind: "manage-subscriptions" },
    { kind: "use-beneficiary" }
  ]
);
assert.deepEqual(GUIDED_USER_ACTION_KINDS.includes("wallet-withdraw"), false);
assert.deepEqual(GUIDED_USER_ACTION_KINDS.includes("update-state"), true);
assert.deepEqual(GUIDED_USER_ACTION_KINDS.includes("manage-subscriptions"), true);

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
  derivePermissionWalletBadgeLabels({
    hasAdminPath: true,
    hasDirectAdminSigner: true,
    hasMultisigPath: false,
    hasDirectUserMatch: true,
    hasBeneficiaryMatch: false,
    hasSubscriptions: true,
    hasLockedUtxos: true,
    lockedUtxosLoading: false,
    availableOperatorPaths: ["admin"],
    availableConsolidatePaths: ["admin"]
  }),
  ["Admin", "Allowance", "Subscriptions"]
);
assert.equal(
  resolveAutomaticSendPath({
    hasAdminPath: true,
    hasDirectAdminSigner: true,
    hasMultisigPath: false,
    hasDirectUserMatch: true,
    hasBeneficiaryMatch: true,
    hasSubscriptions: false,
    hasLockedUtxos: true,
    lockedUtxosLoading: false,
    availableOperatorPaths: ["admin"],
    availableConsolidatePaths: ["admin"]
  }),
  "use"
);
assert.equal(
  resolveAutomaticSendPath({
    hasAdminPath: false,
    hasDirectAdminSigner: false,
    hasMultisigPath: false,
    hasDirectUserMatch: true,
    hasBeneficiaryMatch: true,
    hasSubscriptions: false,
    hasLockedUtxos: true,
    lockedUtxosLoading: false,
    availableOperatorPaths: [],
    availableConsolidatePaths: []
  }),
  "use-allowance"
);
assert.deepEqual(
  deriveWalletHomeFlowAvailability({
    hasAdminPath: true,
    hasDirectAdminSigner: false,
    hasMultisigPath: true,
    hasDirectUserMatch: false,
    hasBeneficiaryMatch: false,
    hasSubscriptions: true,
    hasLockedUtxos: true,
    lockedUtxosLoading: false,
    availableOperatorPaths: ["multisig"],
    availableConsolidatePaths: ["multisig"]
  }),
  {
    canSend: true,
    canAddFunds: true,
    canManagePeople: true,
    canManageSettings: true,
    canPaySubscriptions: true,
    canManageSubscriptions: true
  }
);
assert.equal(
  summarizeAssetKinds(
    [
      { unit: "lovelace", quantity: "1" },
      { unit: "policy1asset1", quantity: "2" },
      { unit: "policy2asset2", quantity: "3" }
    ],
    2
  ),
  "ADA, policy1asset1 +1 more"
);
assert.equal(
  shouldShowCompactAssetSearch([{ unit: "lovelace", quantity: "1" }], ""),
  false
);
assert.equal(
  shouldShowCompactAssetSearch(
    [
      { unit: "lovelace", quantity: "1" },
      { unit: "token1", quantity: "2" },
      { unit: "token2", quantity: "3" }
    ],
    ""
  ),
  true
);
assert.equal(
  summarizeWalletHoldings([
    { unit: "lovelace", quantity: "15000000" },
    { unit: "token1", quantity: "2" }
  ]),
  "15 ADA available"
);
assert.equal(summarizePeopleSection(3, 1), "1 admin(s), 2 user(s)");
assert.equal(summarizeSubscriptionsSection(0), "0 active");
assert.equal(summarizeSettingsSection(2), "2 beneficiary rule(s)");

const suggestedRefs = suggestWalletInputsForRequestedAssets(
  [
    {
      input: { txHash: "a".repeat(64), outputIndex: 0 },
      output: {
        amount: [
          { unit: "lovelace", quantity: "3000000" },
          { unit: "token", quantity: "2" }
        ]
      }
    },
    {
      input: { txHash: "b".repeat(64), outputIndex: 1 },
      output: {
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

const dueAmount = computeSubscriptionDueAmount(
  {
    id: "7",
    payoutAddress: "addr_test1...",
    paidOutAmount: "0",
    policyId: "",
    assetName: "",
    amountPerDay: "1000000",
    startDate: "0",
    endDate: "172800000"
  },
  86400000
);
assert.equal(dueAmount, "1000000");

const payoutTransfer = buildSubscriptionPayoutTransfer(
  {
    id: "7",
    payoutAddress: "addr_test1...",
    paidOutAmount: "0",
    policyId: "",
    assetName: "",
    amountPerDay: "1000000",
    startDate: "0",
    endDate: "172800000"
  },
  "1000000",
  "c".repeat(64),
  2
);
assert.deepEqual(requestedTransferAssets([payoutTransfer]), [
  { unit: "lovelace", quantity: "1000000" }
]);
assert.equal(payoutTransfer.inlineDatum.alternative, 0);
assert.deepEqual(payoutTransfer.inlineDatum.fields, [7, "c".repeat(64), 2]);

console.log("guided helper tests passed");
