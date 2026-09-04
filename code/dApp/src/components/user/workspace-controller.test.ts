import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkspaceSearchParams,
  parseWorkspaceRouteState,
  reduceWorkspaceRouteState
} from "@/components/user/workspace-controller";

test("raw wallet-spend URLs are not routable", () => {
  const parsed = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&action=wallet-spend&step=configure")
  );
  assert.equal(parsed.selectedAction, null);
  assert.equal(parsed.selectedIntent, null);
});

test("an Object.prototype name in the URL is not a workspace action", () => {
  const parsed = parseWorkspaceRouteState(new URLSearchParams("action=constructor"));
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

/**
 * Activity and the asset drill-down used to be component state. Five controls opened
 * Activity; four touched no URL at all, and the fifth dispatched `clear-selected-action`,
 * which produced a byte-identical search string when no action was open, so
 * `commitRouteState` returned early. Back then left `/user` and re-fired the risk gate.
 */
test("the overview section round-trips through the URL", () => {
  const parsed = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&step=overview&view=activity")
  );
  assert.equal(parsed.overviewSection, "transactions");
  assert.equal(
    buildWorkspaceSearchParams(parsed).toString(),
    "wallet=unit&step=overview&view=activity"
  );
});

test("the open asset row round-trips through the URL", () => {
  const parsed = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&step=overview&view=activity&asset=lovelace")
  );
  assert.equal(parsed.assetDetailUnit, "lovelace");
  assert.equal(
    buildWorkspaceSearchParams(parsed).toString(),
    "wallet=unit&step=overview&view=activity&asset=lovelace"
  );
});

test("opening Activity changes the search string, so it earns a history entry", () => {
  const home = parseWorkspaceRouteState(new URLSearchParams("wallet=unit&step=overview"));
  const activity = reduceWorkspaceRouteState(home, {
    type: "open-overview-section",
    section: "transactions"
  });

  assert.notEqual(
    buildWorkspaceSearchParams(home).toString(),
    buildWorkspaceSearchParams(activity).toString()
  );
});

test("the overview params are ignored once an action is open", () => {
  const parsed = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&action=send&step=configure&view=activity&asset=lovelace")
  );
  assert.equal(parsed.overviewSection, "home");
  assert.equal(parsed.assetDetailUnit, null);
  assert.equal(buildWorkspaceSearchParams(parsed).toString().includes("view="), false);
  assert.equal(buildWorkspaceSearchParams(parsed).toString().includes("asset="), false);
});

test("the overview params are ignored without a wallet", () => {
  const parsed = parseWorkspaceRouteState(new URLSearchParams("view=activity&asset=lovelace"));
  assert.equal(parsed.overviewSection, "home");
  assert.equal(parsed.assetDetailUnit, null);
});

test("leaving Activity closes the asset row that was open inside it", () => {
  const open = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&step=overview&view=activity&asset=lovelace")
  );
  const home = reduceWorkspaceRouteState(open, {
    type: "open-overview-section",
    section: "home"
  });

  assert.equal(home.overviewSection, "home");
  assert.equal(home.assetDetailUnit, null);
});

test("choosing an action leaves the overview behind", () => {
  const open = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&step=overview&view=activity&asset=lovelace")
  );
  const sending = reduceWorkspaceRouteState(open, {
    type: "select-workspace-action",
    intent: "send",
    action: "use"
  });

  assert.equal(sending.overviewSection, "home");
  assert.equal(sending.assetDetailUnit, null);
});

test("the URL round trip keeps a spender's use-allowance selection", () => {
  // Serializing the intent (`action=send`) re-parsed through the intent's default
  // action (`send` -> `use`), so on the render after every click the spender's
  // use-allowance selection had become an admin-only use and the clamp guard
  // cleared it — each "Send funds" click bounced straight back to Wallet home.
  const sending = reduceWorkspaceRouteState(
    parseWorkspaceRouteState(new URLSearchParams("wallet=unit")),
    {
      type: "select-workspace-action",
      intent: "send",
      action: "use-allowance",
      flowStep: "configure"
    }
  );

  assert.equal(sending.selectedAction, "use-allowance");
  assert.equal(sending.selectedIntent, "send");

  const roundTripped = parseWorkspaceRouteState(buildWorkspaceSearchParams(sending));

  assert.equal(roundTripped.selectedAction, "use-allowance");
  assert.equal(roundTripped.selectedIntent, "send");
  assert.equal(roundTripped.flowStep, "configure");
});

test("intent-only states still serialize the intent as the action param", () => {
  const state = {
    ...parseWorkspaceRouteState(new URLSearchParams("wallet=unit")),
    selectedIntent: "send" as const,
    selectedAction: null
  };

  const params = buildWorkspaceSearchParams(state);
  assert.equal(params.get("action"), "send");
  assert.equal(parseWorkspaceRouteState(params).selectedAction, "use");
});

test("a wallet-settings selection survives the URL round-trip", () => {
  // `update-state` reparses as `manage-people`, so serializing the action kind for
  // a wallet-settings selection turned the next render into the people editor and
  // made the wallet-settings focused surface (wallet name, co-signer threshold)
  // unreachable from any URL.
  const settings = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&action=wallet-settings&task=settings-multisig-threshold")
  );
  assert.equal(settings.selectedIntent, "wallet-settings");
  assert.equal(settings.selectedAction, "update-state");
  assert.equal(settings.selectedTask, "settings-multisig-threshold");

  const roundTripped = parseWorkspaceRouteState(buildWorkspaceSearchParams(settings));

  assert.equal(roundTripped.selectedIntent, "wallet-settings");
  assert.equal(roundTripped.selectedAction, "update-state");
  assert.equal(roundTripped.selectedTask, "settings-multisig-threshold");
});

test("an old recovery-contact link opens the combined recovery tab", () => {
  const parsed = parseWorkspaceRouteState(
    new URLSearchParams("wallet=unit&action=wallet-settings&task=settings-beneficiaries")
  );

  assert.equal(parsed.selectedTask, "settings-proof-of-life");
});
