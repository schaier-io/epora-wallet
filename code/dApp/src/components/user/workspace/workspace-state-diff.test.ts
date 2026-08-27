import assert from "node:assert/strict";
import test from "node:test";
import { buildStateChangeItems, diffStateForms } from "@/components/user/workspace/workspace-state-diff";
import {
  createDefaultStateForm,
  stateFormFromDatum,
  type StateFormState
} from "@/lib/contracts/state-form";

function baseForm(): StateFormState {
  return {
    ...createDefaultStateForm(),
    walletName: "Shared wallet",
    users: [
      {
        id: "1",
        wallets: ["aa".repeat(28)],
        perDayAllowance: [],
        remainingAllowance: [],
        nextAllowanceReset: "",
        canRenewProofOfLife: true,
        multiSigPowerMode: "none",
        multiSigPower: "",
        isAdmin: true,
        preset: "admin"
      }
    ],
    beneficiaries: [],
    streamingPayments: []
  };
}

/**
 * Each of these edits keeps every count identical, which is exactly why the old
 * count-based receipt could not show them. If one of these stops producing a row, the
 * review screen has silently gone back to being unable to represent the change.
 */

test("a swapped owner key is reported even though the owner count is unchanged", () => {
  const before = baseForm();
  const after = baseForm();
  after.users[0]!.wallets = ["bb".repeat(28)];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.label, /Person changed/);
  assert.match(items[0]!.value, /→/);
  assert.equal(items[0]!.tone, "warning");
});

test("a raised spending limit is reported even though the person count is unchanged", () => {
  const before = baseForm();
  const after = baseForm();
  after.users[0]!.perDayAllowance = [{ policyId: "", assetName: "", amount: "10000000000" }];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.value, /no daily limit → /);
  assert.match(items[0]!.value, /10,000 ₳/);
});

test("lowering the approval threshold is reported", () => {
  const before = baseForm();
  before.multiSigThresholdMode = "some";
  before.multiSigThreshold = "2";
  const after = baseForm();
  after.multiSigThresholdMode = "none";

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.label, "Approvals needed");
  assert.match(items[0]!.value, /2 → any single owner/);
});

test("clearing the wake-up timer is reported, and says what it costs", () => {
  const before = baseForm();
  before.proofOfLifeUnlockTimeMode = "some";
  before.proofOfLifeUnlockTime = "1780000000000";
  const after = baseForm();
  after.proofOfLifeUnlockTimeMode = "none";

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.label, "Wake-up timer");
  assert.match(items[0]!.value, /→ off$/);
  assert.match(items[0]!.detail!, /can never claim this wallet while the timer is off/);
});

test("a repointed recovery contact is reported even though the contact count is unchanged", () => {
  const before = baseForm();
  before.beneficiaries = [
    { id: "1", wallets: ["cc".repeat(28)], unlockAfterMode: "none", unlockAfter: "", weight: "1" }
  ];
  const after = baseForm();
  after.beneficiaries = [
    { id: "1", wallets: ["dd".repeat(28)], unlockAfterMode: "none", unlockAfter: "", weight: "1" }
  ];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.label, /Recovery contact changed/);
});

test("a repointed scheduled payment is reported even though the rule count is unchanged", () => {
  const before = baseForm();
  before.streamingPayments = [
    {
      id: "1",
      payoutAddress: "addr_test_one",
      paidOutAmount: "0",
      policyId: "",
      assetName: "",
      amountPerDay: "5000000",
      startDate: "1",
      endDate: "2"
    }
  ];
  const after = baseForm();
  after.streamingPayments = [{ ...before.streamingPayments[0]!, payoutAddress: "addr_test_two" }];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.label, /Scheduled payment changed/);
  assert.match(items[0]!.value, /addr_test_one .* → addr_test_two /);
});

test("adding and removing a person are reported separately", () => {
  const before = baseForm();
  const after = baseForm();
  after.users = [
    { ...before.users[0]!, id: "2", wallets: ["ee".repeat(28)], isAdmin: false, preset: "custom" }
  ];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 2);
  assert.ok(items.some((item) => item.label === "Person added"));
  assert.ok(items.some((item) => item.label === "Person removed"));
});

test("an unchanged form says so instead of listing the resulting state", () => {
  const { items, isDiff } = buildStateChangeItems(baseForm(), baseForm(), []);
  assert.equal(isDiff, true);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.label, "No changes");
});

test("with no baseline loaded it falls back and flags that it is not a diff", () => {
  const fallback = [{ label: "Owners", value: "1 owner" }];
  const { items, isDiff } = buildStateChangeItems(null, baseForm(), fallback);
  assert.equal(isDiff, false);
  assert.deepEqual(items, fallback);
});

test("renaming is reported as cosmetic, not as an access change", () => {
  const before = baseForm();
  const after = baseForm();
  after.walletName = "Renamed";

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.label, "Name");
  assert.match(items[0]!.detail!, /changes nothing about who can spend/);
  assert.notEqual(items[0]!.tone, "warning");
});

/**
 * Why `use-workspace-review-derivations` guards on `selectedDetectedToken?.datum` and not
 * just on the token.
 *
 * Detection keeps a wallet whose datum could not be decoded (`decodeDatumFromUtxo` answers
 * null for a UTxO with no inline datum, or one that will not deserialize), and
 * `stateFormFromDatum` turns that null into a blank default rather than throwing. Handing
 * that blank form in as the baseline is not "no baseline": it is a baseline claiming the
 * wallet has nobody in it, so the diff calls every owner, recovery contact and schedule the
 * wallet already has an addition. The review rail is the only human checkpoint before an
 * on-chain state rewrite, so it must not invent changes that are not happening.
 */
test("an unreadable datum does not become an empty baseline", () => {
  const blankBaseline = stateFormFromDatum(null);
  const after = baseForm();

  const invented = diffStateForms(blankBaseline, after);
  assert.ok(
    invented.some((item) => item.label === "Person added"),
    "guard rationale: a blank baseline reports the wallet's existing owner as an addition"
  );

  // `null` is the signal that says there is nothing to compare against, and it makes
  // `buildStateChangeItems` show the snapshot instead of a fabricated diff.
  const fallback = [{ label: "Owners", value: "1 owner" }];
  const result = buildStateChangeItems(null, after, fallback);
  assert.equal(result.isDiff, false);
  assert.deepEqual(result.items, fallback);
});
