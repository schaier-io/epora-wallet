import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";

import { canProposeSelectedActionAtom } from "./workspace-stt-options.atoms";
import { routeStateAtom } from "./workspace-route.atoms";
import { sttAuthorityPathAtom, sttStateFormAtom } from "./forms/stt-spend-form.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import {
  type StateFormState,
  type UserFormState,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";

const WALLET_UNIT = "a".repeat(56) + "b".repeat(8);
const OWNER_KEY_HASH = "cc".repeat(28);
const OUTSIDER_KEY_HASH = "ee".repeat(28);

/**
 * `canProposeSelectedActionAtom` gates the "Save as approval request" control. Before this
 * atom the control needed a finished preview, and the only control that produced one also
 * signed and broadcast, so preparing a request meant sending the transaction first. These
 * hold the conditions the builder itself applies (`workspace-transactions.ts:262`) plus the
 * authorisation rule: an owner signing the admin path authorizes alone, so the request flow
 * only appears where it adds signatures that are actually needed.
 */
// `selectedActionAtom` derives from the route, so the action arrives as a URL param, the
// same path the app takes.
function storeWith(options: { action: string; path: string; walletUnit?: string; users?: UserFormState[] }) {
  const store = createStore();
  const params = new URLSearchParams({ action: options.action });
  if (options.walletUnit) {
    params.set("wallet", options.walletUnit);
  }
  store.set(routeStateAtom, parseWorkspaceRouteState(params));
  store.set(sttAuthorityPathAtom, options.path as never);
  if (options.users) {
    const form = { ...store.get(sttStateFormAtom) } as StateFormState;
    form.users = options.users;
    store.set(sttStateFormAtom, form);
  }
  return store;
}

function adminWith(wallet: string): UserFormState {
  return { ...createDefaultUserFormState("1"), isAdmin: true, wallets: [wallet] };
}

test("an operator path on an STT action with a known wallet can be proposed", () => {
  for (const path of ["admin", "multisig"]) {
    const store = storeWith({ action: "use", path, walletUnit: WALLET_UNIT });
    assert.equal(store.get(canProposeSelectedActionAtom), true, path);
  }
});

test("a single-signer path is never proposable", () => {
  for (const path of ["user", "beneficiary", "rule-driven"]) {
    const store = storeWith({ action: "use", path, walletUnit: WALLET_UNIT });
    assert.equal(store.get(canProposeSelectedActionAtom), false, path);
  }
});

test("a non-STT action is never proposable", () => {
  for (const action of ["mint", "lock-funds", "wallet-withdraw", "wallet-vote"]) {
    const store = storeWith({ action, path: "admin", walletUnit: WALLET_UNIT });
    assert.equal(store.get(canProposeSelectedActionAtom), false, action);
  }
});

test("without a selected wallet there is no identity to propose against", () => {
  const store = storeWith({ action: "use", path: "admin" });
  assert.equal(store.get(canProposeSelectedActionAtom), false);
});

test("an owner on the admin path is not offered the request flow", () => {
  // Their own signature already authorizes the action; a request would collect
  // exactly that one signature and add nothing but clicks.
  const store = storeWith({
    action: "use",
    path: "admin",
    walletUnit: WALLET_UNIT,
    users: [adminWith(OWNER_KEY_HASH)]
  });
  store.set(activePaymentKeyHashAtom, OWNER_KEY_HASH);
  assert.equal(store.get(canProposeSelectedActionAtom), false);
});

test("a wallet the admin list does not cover can prepare a request for the owners", () => {
  const store = storeWith({
    action: "use",
    path: "admin",
    walletUnit: WALLET_UNIT,
    users: [adminWith(OWNER_KEY_HASH)]
  });
  store.set(activePaymentKeyHashAtom, OUTSIDER_KEY_HASH);
  assert.equal(store.get(canProposeSelectedActionAtom), true);
});

test("the multisig path always offers the request flow, owner or not", () => {
  const store = storeWith({
    action: "use",
    path: "multisig",
    walletUnit: WALLET_UNIT,
    users: [adminWith(OWNER_KEY_HASH)]
  });
  store.set(activePaymentKeyHashAtom, OWNER_KEY_HASH);
  assert.equal(store.get(canProposeSelectedActionAtom), true);
});

