import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "jotai";

import { canProposeSelectedActionAtom } from "./workspace-stt-options.atoms";
import { routeStateAtom } from "./workspace-route.atoms";
import { sttAuthorityPathAtom } from "./forms/stt-spend-form.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";

const WALLET_UNIT = "a".repeat(56) + "b".repeat(8);

/**
 * `canProposeSelectedActionAtom` gates the "Save as approval request" control. Before this
 * atom the control needed a finished preview, and the only control that produced one also
 * signed and broadcast, so preparing a request meant sending the transaction first. These
 * hold the three conditions the builder itself applies (`workspace-transactions.ts:262`).
 */
// `selectedActionAtom` derives from the route, so the action arrives as a URL param, the
// same path the app takes.
function storeWith(options: { action: string; path: string; walletUnit?: string }) {
  const store = createStore();
  const params = new URLSearchParams({ action: options.action });
  if (options.walletUnit) {
    params.set("wallet", options.walletUnit);
  }
  store.set(routeStateAtom, parseWorkspaceRouteState(params));
  store.set(sttAuthorityPathAtom, options.path as never);
  return store;
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
