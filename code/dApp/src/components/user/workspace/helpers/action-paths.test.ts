import assert from "node:assert/strict";
import test from "node:test";

import {
  isActionBlockedByCapabilities,
  resolveSttFundPoolInputs,
  supportsSttFundPoolInputs
} from "@/components/user/workspace/helpers/action-paths";
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

test("administrative actions do not support fund-pool inputs", () => {
  assert.equal(supportsSttFundPoolInputs("renew-proof-of-life"), false);
  assert.equal(supportsSttFundPoolInputs("update-state"), false);
  assert.equal(supportsSttFundPoolInputs("manage-streaming-payments"), false);
  assert.equal(supportsSttFundPoolInputs("use"), true);
});

test("administrative actions ignore fund pools kept in the shared draft", () => {
  const inputs = [{ txHash: "ab".repeat(32), outputIndex: 0 }];

  assert.deepEqual(resolveSttFundPoolInputs("update-state", inputs), []);
  assert.equal(resolveSttFundPoolInputs("use", inputs), inputs);
});
