import assert from "node:assert/strict";
import test from "node:test";

import { isActionBlockedByCapabilities } from "@/components/user/workspace/helpers/action-paths";
import type { UserActionKind } from "@/components/user/flow-types";

const selectable = new Set<UserActionKind>(["use", "lock-funds", "wallet-publish"]);

test("blocks an advanced action the connected key has no path to", () => {
  assert.equal(isActionBlockedByCapabilities("wallet-vote", selectable, true), true);
});

test("allows an action the capability map lists", () => {
  assert.equal(isActionBlockedByCapabilities("wallet-publish", selectable, true), false);
});

test("blocks nothing before the capability map has resolved", () => {
  assert.equal(isActionBlockedByCapabilities("wallet-vote", selectable, false), false);
});

test("never blocks the create-wallet mode", () => {
  assert.equal(isActionBlockedByCapabilities("mint", new Set(), true), false);
});
