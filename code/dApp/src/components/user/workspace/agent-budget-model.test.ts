import assert from "node:assert/strict";
import test from "node:test";

import { deriveAgentBudgets } from "./agent-budget-model";
import {
  createDefaultStateForm,
  type UserFormState
} from "@/lib/contracts/state-form";

const NOW_MS = 1_000_000_000_000;

function user(overrides: Partial<UserFormState>): UserFormState {
  return {
    id: "0",
    wallets: [],
    perDayAllowance: [],
    remainingAllowance: [],
    nextAllowanceReset: "0",
    canRenewProofOfLife: false,
    multiSigPowerMode: "none",
    multiSigPower: "",
    isAdmin: false,
    preset: "custom",
    ...overrides
  };
}

function stateWith(users: UserFormState[]) {
  const state = createDefaultStateForm();
  state.users = users;
  return state;
}

test("lists only records that carry a positive per-day allowance", () => {
  const state = stateWith([
    user({ id: "0", isAdmin: true }),
    user({
      id: "1",
      perDayAllowance: [{ policyId: "", assetName: "", amount: "12" }],
      remainingAllowance: [{ policyId: "", assetName: "", amount: "12" }],
      nextAllowanceReset: String(NOW_MS + 60_000)
    })
  ]);

  const budgets = deriveAgentBudgets(state, NOW_MS);

  assert.equal(budgets.length, 1);
  assert.equal(budgets[0]?.userId, "1");
  assert.equal(budgets[0]?.recordIndex, 1);
});

test("spends subtract exactly across decimal and native-asset amounts", () => {
  const state = stateWith([
    user({
      id: "2",
      perDayAllowance: [
        { policyId: "", assetName: "", amount: "12.5" },
        { policyId: "pid", assetName: "token", amount: "5000" }
      ],
      remainingAllowance: [
        { policyId: "", assetName: "", amount: "7.25" },
        { policyId: "pid", assetName: "token", amount: "1500" }
      ],
      nextAllowanceReset: String(NOW_MS + 60_000)
    })
  ]);

  const [budget] = deriveAgentBudgets(state, NOW_MS);

  assert.deepEqual(
    budget?.assets.map((asset) => [asset.limit, asset.remaining, asset.spent]),
    [
      ["12.5", "7.25", "5.25"],
      ["5000", "1500", "3500"]
    ]
  );
  assert.equal(budget?.status, "available");
});

test("a due reset restores the full per-day allowance", () => {
  const state = stateWith([
    user({
      id: "3",
      perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
      remainingAllowance: [{ policyId: "", assetName: "", amount: "2" }],
      nextAllowanceReset: String(NOW_MS - 1)
    })
  ]);

  const [budget] = deriveAgentBudgets(state, NOW_MS);

  assert.equal(budget?.reset.kind, "reset-due");
  assert.equal(budget?.assets[0]?.remaining, "10");
  assert.equal(budget?.assets[0]?.spent, "0");
  assert.equal(budget?.status, "available");
});

test("a scheduled reset keeps the current window and carries the timestamp", () => {
  const state = stateWith([
    user({
      id: "4",
      perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
      remainingAllowance: [{ policyId: "", assetName: "", amount: "4" }],
      nextAllowanceReset: String(NOW_MS + 3_600_000)
    })
  ]);

  const [budget] = deriveAgentBudgets(state, NOW_MS);

  assert.deepEqual(budget?.reset, { kind: "reset-scheduled", resetAtMs: NOW_MS + 3_600_000 });
  assert.equal(budget?.assets[0]?.spent, "6");
});

test("a missing reset stamp degrades to unknown without inventing availability", () => {
  for (const stamp of ["", "0", "abc", "99999999999999999999"]) {
    const state = stateWith([
      user({
        id: "5",
        perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
        remainingAllowance: [{ policyId: "", assetName: "", amount: "4" }],
        nextAllowanceReset: stamp
      })
    ]);

    const [budget] = deriveAgentBudgets(state, NOW_MS);

    assert.equal(budget?.reset.kind, "reset-unknown", `stamp: ${stamp}`);
    assert.equal(budget?.assets[0]?.remaining, "4");
  }
});

test("a record with nothing left reads as exhausted", () => {
  const state = stateWith([
    user({
      id: "6",
      perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
      remainingAllowance: [{ policyId: "", assetName: "", amount: "0" }],
      nextAllowanceReset: String(NOW_MS + 60_000)
    })
  ]);

  const [budget] = deriveAgentBudgets(state, NOW_MS);

  assert.equal(budget?.status, "exhausted");
  assert.equal(budget?.assets[0]?.spent, "10");
});

test("a missing remaining entry counts as fully spent, not as available", () => {
  const state = stateWith([
    user({
      id: "7",
      perDayAllowance: [{ policyId: "", assetName: "", amount: "10" }],
      remainingAllowance: [],
      nextAllowanceReset: String(NOW_MS + 60_000)
    })
  ]);

  const [budget] = deriveAgentBudgets(state, NOW_MS);

  assert.equal(budget?.status, "exhausted");
  assert.equal(budget?.assets[0]?.remaining, "0");
});

test("a remaining above the limit is reported as-is and never as negative spending", () => {
  const state = stateWith([
    user({
      id: "8",
      perDayAllowance: [{ policyId: "", assetName: "", amount: "5" }],
      remainingAllowance: [{ policyId: "", assetName: "", amount: "7" }],
      nextAllowanceReset: String(NOW_MS + 60_000)
    })
  ]);

  const [budget] = deriveAgentBudgets(state, NOW_MS);

  assert.equal(budget?.assets[0]?.spent, "0");
  assert.equal(budget?.status, "available");
});

test("an unreadable remaining stays visible but unknown instead of faking a number", () => {
  const state = stateWith([
    user({
      id: "9",
      perDayAllowance: [{ policyId: "", assetName: "", amount: "5" }],
      remainingAllowance: [{ policyId: "", assetName: "", amount: "1.2.3" }],
      nextAllowanceReset: String(NOW_MS + 60_000)
    })
  ]);

  const [budget] = deriveAgentBudgets(state, NOW_MS);

  assert.equal(budget?.assets[0]?.remaining, null);
  assert.equal(budget?.assets[0]?.spent, null);
  // Unknown is not zero: the console must not call this exhausted.
  assert.equal(budget?.status, "available");
});

test("matching keys pair limits with their own remaining entries", () => {
  const state = stateWith([
    user({
      id: "10",
      perDayAllowance: [
        { policyId: "", assetName: "", amount: "10" },
        { policyId: "pid", assetName: "gem", amount: "100" }
      ],
      remainingAllowance: [
        { policyId: "pid", assetName: "gem", amount: "40" },
        { policyId: "", assetName: "", amount: "1" }
      ],
      nextAllowanceReset: String(NOW_MS + 60_000)
    })
  ]);

  const [budget] = deriveAgentBudgets(state, NOW_MS);

  assert.deepEqual(
    budget?.assets.map((asset) => [asset.remaining, asset.spent]),
    [
      ["1", "9"],
      ["40", "60"]
    ]
  );
});
