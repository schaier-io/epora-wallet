import assert from "node:assert/strict";
import test from "node:test";
import { buildStateChangeItems, diffStateForms } from "@/components/user/workspace/workspace-state-diff";
import { defaultFormatter } from "@/i18n/default-translator";
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
  // The form's ADA row carries the limit as ADA text, exactly as the editor's
  // input holds it — not the lovelace the datum stores.
  after.users[0]!.perDayAllowance = [{ policyId: "", assetName: "", amount: "10000" }];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.value, /no daily limit → /);
  assert.match(items[0]!.value, /10000 ₳/);
});

test("a five-ADA daily limit is not divided by a million on the way to the review", () => {
  // The receipt used to run the form's ADA text through `formatLovelaceAsAda`,
  // which expects lovelace, so a person's 5 ₳ limit read "daily limit 0.000005 ₳"
  // on the one screen meant to confirm what will be signed.
  const before = baseForm();
  const after = baseForm();
  after.users[0]!.perDayAllowance = [{ policyId: "", assetName: "", amount: "5" }];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.value, /daily limit 5 ₳/);
  assert.doesNotMatch(items[0]!.value, /0\.00000/);
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

test("clearing the proof of life is reported, and says what it costs", () => {
  const before = baseForm();
  before.proofOfLifeUnlockTimeMode = "some";
  before.proofOfLifeUnlockTime = "1780000000000";
  const after = baseForm();
  after.proofOfLifeUnlockTimeMode = "none";

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.label, "Proof of life");
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

test("a changed approval power is reported even though the person count is unchanged", () => {
  // These fields change the datum but were missing from the person description, so the
  // review said "Nothing to apply".
  const before = baseForm();
  const after = baseForm();
  after.users[0]!.multiSigPowerMode = "some";
  after.users[0]!.multiSigPower = "2";

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.label, /Person changed/);
  assert.match(items[0]!.value, /approval power none .* → .*approval power 2 /);
});

test("a revoked timer-renewal right is reported", () => {
  const before = baseForm();
  const after = baseForm();
  after.users[0]!.canRenewProofOfLife = false;

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.value, /can check in .* → .*cannot check in/);
});

test("a changed recovery-contact wait is reported", () => {
  const before = baseForm();
  before.beneficiaries = [
    { id: "1", wallets: ["cc".repeat(28)], unlockAfterMode: "none", unlockAfter: "", weight: "1" }
  ];
  const after = baseForm();
  after.beneficiaries = [
    { ...before.beneficiaries[0]!, unlockAfterMode: "some", unlockAfter: "1790955182000" }
  ];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.label, /Recovery contact changed/);
  // `unlock_after` is a point in time, not a wait: the editor stores a timestamp.
  assert.ok(
    items[0]!.value.endsWith(`after ${defaultFormatter.dateTime(1790955182000, "short")}`),
    items[0]!.value
  );
});

test("a moved schedule end date is reported", () => {
  const before = baseForm();
  before.streamingPayments = [
    {
      id: "1",
      payoutAddress: "addr_test_one",
      paidOutAmount: "0",
      policyId: "",
      assetName: "",
      amountPerDay: "5000000",
      startDate: "1700000000000",
      endDate: "1700086400000"
    }
  ];
  const after = baseForm();
  after.streamingPayments = [{ ...before.streamingPayments[0]!, endDate: "1700172800000" }];

  const items = diffStateForms(before, after);
  assert.equal(items.length, 1);
  assert.match(items[0]!.label, /Scheduled payment changed/);
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
