import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";

test("raw wallet-spend URLs are not routable", () => {
  const parsed = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&action=wallet-spend&step=configure")
  );
  assert.equal(parsed.selectedAction, null);
  assert.equal(parsed.selectedIntent, null);
});

test("manual tools no longer default to raw wallet-spend", () => {
  const parsed = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&action=manual-tools&step=configure")
  );
  assert.equal(parsed.selectedAction, null);
  assert.equal(parsed.selectedIntent, "manual-tools");
});
