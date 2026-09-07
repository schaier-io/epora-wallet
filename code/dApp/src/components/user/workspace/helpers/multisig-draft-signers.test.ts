import { test } from "node:test";
import assert from "node:assert/strict";

import { createDefaultStateForm, type StateFormState, type UserFormState } from "@/lib/contracts/state-form";
import { multisigDraftSignerKeyHashes } from "./multisig-draft-signers";

const PROPOSER = "aa0000000000000000000000000000000000000000000000000000000000000f";
const CO_SIGNER = "bb00000000000000000000000000000000000000000000000000000000000000f";

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
    preset: "limited-withdrawal",
    ...overrides
  };
}

function form(
  users: UserFormState[],
  threshold: { mode: "some" | "none"; value?: number | string }
): StateFormState {
  const form = createDefaultStateForm();
  form.users = users;
  form.multiSigThresholdMode = threshold.mode;
  form.multiSigThreshold = threshold.value != null ? String(threshold.value) : "";
  return form;
}

test("lists the other power holders when the threshold exceeds the proposer's power", () => {
  const state = form(
    [
      user({ id: "0", wallets: [PROPOSER], isAdmin: true, multiSigPowerMode: "some", multiSigPower: "1" }),
      user({ id: "1", wallets: [CO_SIGNER], multiSigPowerMode: "some", multiSigPower: "1" })
    ],
    { mode: "some", value: 2 }
  );
  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), [CO_SIGNER]);
});

test("keeps a threshold the proposer alone meets on the proposer-only draft", () => {
  const state = form(
    [
      user({ id: "0", wallets: [PROPOSER], isAdmin: true, multiSigPowerMode: "some", multiSigPower: "1" }),
      user({ id: "1", wallets: [CO_SIGNER], multiSigPowerMode: "some", multiSigPower: "1" })
    ],
    { mode: "some", value: 1 }
  );
  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), []);
});

test("leaves a threshold-less multisig draft alone", () => {
  const state = form(
    [
      user({ id: "0", wallets: [PROPOSER], isAdmin: true, multiSigPowerMode: "some", multiSigPower: "1" }),
      user({ id: "1", wallets: [CO_SIGNER], multiSigPowerMode: "some", multiSigPower: "1" })
    ],
    { mode: "none" }
  );
  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), []);
});

test("lists every power holder when the proposer holds none", () => {
  const owner = "cc0000000000000000000000000000000000000000000000000000000000000f";
  const state = form(
    [
      user({ id: "0", wallets: [owner], isAdmin: true, multiSigPowerMode: "some", multiSigPower: "1" }),
      user({ id: "1", wallets: [CO_SIGNER], multiSigPowerMode: "some", multiSigPower: "1" })
    ],
    { mode: "some", value: 2 }
  );
  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), [owner, CO_SIGNER]);
});

test("matches the proposer key case-insensitively", () => {
  const state = form(
    [
      user({ id: "0", wallets: [PROPOSER], isAdmin: true, multiSigPowerMode: "some", multiSigPower: "2" }),
      user({ id: "1", wallets: [CO_SIGNER], multiSigPowerMode: "some", multiSigPower: "1" })
    ],
    { mode: "some", value: 2 }
  );
  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER.toUpperCase()), []);
});

test("lists a co-signer when uint64 power is one below the exact threshold", () => {
  const state = form(
    [
      user({
        id: "0",
        wallets: [PROPOSER],
        multiSigPowerMode: "some",
        multiSigPower: "9007199254740992"
      }),
      user({
        id: "1",
        wallets: [CO_SIGNER],
        multiSigPowerMode: "some",
        multiSigPower: "1"
      })
    ],
    { mode: "some", value: "9007199254740993" }
  );

  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), [CO_SIGNER]);
});

test("lists one wallet for a power holder with ten wallets", () => {
  const alternatives = Array.from(
    { length: 10 },
    (_, index) => index.toString(16).padStart(56, "0")
  );
  const state = form(
    [
      user({
        id: "0",
        wallets: [PROPOSER],
        multiSigPowerMode: "some",
        multiSigPower: "1"
      }),
      user({
        id: "1",
        wallets: alternatives,
        multiSigPowerMode: "some",
        multiSigPower: "1"
      })
    ],
    { mode: "some", value: 2 }
  );

  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), [alternatives[0]]);
});

test("one overlapping wallet can supply multiple user records' power", () => {
  const first = "01".repeat(28);
  const shared = "02".repeat(28);
  const last = "03".repeat(28);
  const state = form(
    [
      user({
        id: "0",
        wallets: [first, shared],
        multiSigPowerMode: "some",
        multiSigPower: "1"
      }),
      user({
        id: "1",
        wallets: [shared, last],
        multiSigPowerMode: "some",
        multiSigPower: "1"
      })
    ],
    { mode: "some", value: 2 }
  );

  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), [shared]);
});

test("selects the smallest set when nine additional signers are required", () => {
  const coSigners = Array.from(
    { length: 9 },
    (_, index) => (index + 1).toString(16).padStart(56, "0")
  );
  const state = form(
    [
      user({
        id: "0",
        wallets: [PROPOSER],
        multiSigPowerMode: "some",
        multiSigPower: "1"
      }),
      ...coSigners.map((wallet, index) =>
        user({
          id: String(index + 1),
          wallets: [wallet],
          multiSigPowerMode: "some",
          multiSigPower: "1"
        })
      )
    ],
    { mode: "some", value: 10 }
  );

  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), coSigners);
});

test("does not stop a legacy 15-of-15 draft at the former signer cap", () => {
  const coSigners = Array.from(
    { length: 14 },
    (_, index) => (index + 1).toString(16).padStart(56, "0")
  );
  const state = form(
    [
      user({
        id: "0",
        wallets: [PROPOSER],
        multiSigPowerMode: "some",
        multiSigPower: "1"
      }),
      ...coSigners.map((wallet, index) =>
        user({
          id: String(index + 1),
          wallets: [wallet],
          multiSigPowerMode: "some",
          multiSigPower: "1"
        })
      )
    ],
    { mode: "some", value: 15 }
  );

  assert.deepEqual(multisigDraftSignerKeyHashes(state, PROPOSER), coSigners);
});
