import assert from "node:assert/strict";
import test from "node:test";

import { USER_ACTION_DEFINITIONS } from "@/lib/user-flow/action-definitions";

test("action definitions omit unused catalog metadata", () => {
  const unusedFields = [
    "audience",
    "availabilityReason",
    "buildLabel",
    "group",
    "lane"
  ];

  for (const definition of USER_ACTION_DEFINITIONS) {
    for (const field of unusedFields) {
      assert.equal(
        Object.hasOwn(definition, field),
        false,
        `${definition.kind} still carries unused ${field}`
      );
    }
  }
});
