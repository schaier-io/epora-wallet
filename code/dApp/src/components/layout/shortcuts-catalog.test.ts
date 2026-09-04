import assert from "node:assert/strict";
import test from "node:test";
import {
  CREATE_WALLET_TARGET,
  NAV_TARGETS,
  SHORTCUTS
} from "@/components/layout/shortcuts-catalog";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { GUIDED_ADMIN_GROUPS, GUIDED_ADMIN_TASK_MAP } from "@/components/user/workspace/guided-admin-catalog";
import { USER_ACTION_DEFINITION_MAP } from "@/lib/user-flow/action-definitions";
import {
  isImplicitLockedInputSurfaceLabel,
  type UserWorkspaceIntent
} from "@/components/user/flow-types";
import { type GuidedAdminGroupId } from "@/components/user/workspace/types";

/**
 * The shortcuts sheet is a map of the app. A map that renames the places it points at is
 * worse than no map: the reader presses the keys, lands somewhere headed differently, and
 * cannot tell whether they arrived.
 *
 * So the rule is not "match one canonical string" -- several of these destinations honestly
 * have more than one name (an action has a `label` and a `shortLabel`; an admin group has a
 * group label). The rule is that the sheet may only use a name the destination already
 * carries, never invent a new one. Three labels had: `Send money` for a screen that says
 * "Send funds", `Receive money` for one that says "Add funds", and `Create a new wallet`
 * for "Create wallet".
 *
 * The target query is parsed with the app's own `parseWorkspaceRouteState`, not a
 * reimplementation of it, so this fails if the routing changes under the sheet as well as
 * when a label is edited.
 */

// The intent ids and the admin group ids agree on two of three names. `streamingPayments`
// is the odd one out, so the link is spelled rather than inferred from string equality.
const INTENT_GROUP: Partial<Record<UserWorkspaceIntent, GuidedAdminGroupId>> = {
  "manage-people": "wallet-settings",
  "wallet-settings": "wallet-settings",
  "manage-streaming-payments": "streamingPayments"
};

function namesFor(target: string): string[] {
  const state = parseWorkspaceRouteState(new URLSearchParams(target));
  const names: string[] = [];

  if (state.selectedAction) {
    const definition = USER_ACTION_DEFINITION_MAP[state.selectedAction];
    names.push(definition.label, definition.shortLabel);
    // `surfaceLabel` is a sentinel on the send paths -- compared, never rendered
    // (`copy-terms.test.ts:73`). A sentinel is not a name a user can read, so it is not a
    // name the sheet may borrow.
    if (!isImplicitLockedInputSurfaceLabel(definition.surfaceLabel)) {
      names.push(definition.surfaceLabel);
    }
  }

  const groupId = state.selectedIntent ? INTENT_GROUP[state.selectedIntent] : undefined;
  if (groupId) {
    const group = GUIDED_ADMIN_GROUPS.find((candidate) => candidate.id === groupId);
    if (group) names.push(group.label);
  }

  // A task lands on a named tab of its surface; the tab's own label is a name the
  // destination carries ("People" inside Wallet settings).
  if (state.selectedTask) {
    const task = GUIDED_ADMIN_TASK_MAP[state.selectedTask];
    if (task) names.push(task.label, task.shortLabel);
  }

  return names;
}

const NAV_SHORTCUTS = SHORTCUTS.filter(
  (shortcut) => shortcut.keys[0] === "g" && shortcut.keys.length === 2
);

test("every jump in the sheet is a jump the handler can make", () => {
  const keys = NAV_SHORTCUTS.map((shortcut) => shortcut.keys[1]).sort();
  // `c` is handled by its own branch, so it is the one jump not in `NAV_TARGETS`.
  assert.deepEqual(keys, [...Object.keys(NAV_TARGETS), "c"].sort());
});

for (const shortcut of NAV_SHORTCUTS) {
  const key = shortcut.keys[1];
  const target = key === "c" ? CREATE_WALLET_TARGET : NAV_TARGETS[key];

  test(`"g ${key}" is labelled with a name its destination carries`, () => {
    // Wallet home is the overview, not an action, so it has no definition to draw a name
    // from. Its one requirement is that it really does land on the overview.
    if (key === "h") {
      const state = parseWorkspaceRouteState(new URLSearchParams(target));
      assert.equal(state.selectedAction, null);
      assert.equal(state.flowStep, "overview");
      assert.equal(shortcut.label, "Wallet home");
      return;
    }

    const names = namesFor(target);
    assert.ok(
      names.includes(shortcut.label),
      `"${shortcut.label}" is a name nothing at ${target} uses. It answers to: ${names.join(", ")}`
    );
  });
}
