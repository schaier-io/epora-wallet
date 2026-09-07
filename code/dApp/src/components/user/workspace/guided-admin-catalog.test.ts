import assert from "node:assert/strict";
import test from "node:test";

import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";

test("wallet settings puts the name before people and merges recovery", () => {
  const tasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === "wallet-settings");

  assert.deepEqual(
    tasks.map((task) => task.id),
    [
      "settings-wallet-name",
      "settings-people",
      "settings-proof-of-life",
      "settings-multisig-threshold"
    ]
  );
  assert.equal(tasks[2]?.shortLabel, "Recovery");
});
