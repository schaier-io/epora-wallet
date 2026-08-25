import assert from "node:assert/strict";
import test from "node:test";

import type { UserWorkspaceRouteState } from "@/components/user/flow-types";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { workspaceTitleFragment } from "@/components/user/workspace/workspace-document-title";

/**
 * Back now pushes real history entries, so every workspace state sharing one document
 * title turned the browser's history menu into a column of identical rows.
 */
const BASE: UserWorkspaceRouteState = {
  workspaceMode: "landing",
  selectedWalletUnit: null,
  selectedAction: null,
  selectedIntent: null,
  selectedTask: null,
  flowStep: "overview",
  overviewSection: "home",
  assetDetailUnit: null
};

const WALLET = "67c11430b30ec8d03c2cce22b149265fef3c866af5b364568185f93c4a54e323";

test("nothing selected leaves the route's own title alone", () => {
  assert.equal(workspaceTitleFragment(BASE), null);
});

test("the wallet-creation flow is named", () => {
  assert.equal(workspaceTitleFragment({ ...BASE, workspaceMode: "new-wallet" }), "Create wallet");
});

test("an open wallet with no action falls back to the wallet home", () => {
  assert.equal(workspaceTitleFragment({ ...BASE, selectedWalletUnit: WALLET }), "Wallet home");
});

test("the Activity half of the overview gets its own title", () => {
  assert.equal(
    workspaceTitleFragment({
      ...BASE,
      selectedWalletUnit: WALLET,
      overviewSection: "transactions"
    }),
    "Activity"
  );
});

test("a selected action is named", () => {
  assert.equal(
    workspaceTitleFragment({ ...BASE, selectedWalletUnit: WALLET, selectedAction: "use" }),
    "Send funds"
  );
});

test("the task wins over the action, because the task is the narrower place", () => {
  assert.equal(
    workspaceTitleFragment({
      ...BASE,
      selectedWalletUnit: WALLET,
      selectedAction: "update-state",
      selectedTask: "settings-wallet-name"
    }),
    "Wallet name"
  );
});

test("the name leads and the step trails, since history menus truncate from the right", () => {
  assert.equal(
    workspaceTitleFragment({
      ...BASE,
      selectedWalletUnit: WALLET,
      selectedAction: "use",
      flowStep: "review"
    }),
    "Send funds (review)"
  );
});

test("every guided task gets its own title", () => {
  const tasks = [
    "people-admins-signers",
    "people-spending-users",
    "people-wallet-assignments",
    "settings-wallet-name",
    "settings-beneficiaries",
    "settings-proof-of-life",
    "settings-multisig-threshold",
    "streaming-payments-add",
    "streaming-payments-edit-renew",
    "streaming-payments-pay-due"
  ] as const;

  const titles = tasks.map((selectedTask) =>
    workspaceTitleFragment({ ...BASE, selectedWalletUnit: WALLET, selectedTask })
  );

  assert.ok(titles.every((title) => typeof title === "string" && title.length > 0));
  assert.equal(new Set(titles).size, tasks.length);
});

/**
 * The whole point of the server-side derivation: the query string the workspace navigates
 * to has to produce the title, without a second parser.
 */
test("real workspace URLs produce distinct titles", () => {
  const titleFor = (search: string) =>
    workspaceTitleFragment(parseWorkspaceRouteState(new URLSearchParams(search)));

  assert.equal(titleFor(`wallet=${WALLET}&step=overview`), "Wallet home");
  assert.equal(titleFor(`wallet=${WALLET}&action=send&step=configure`), "Send funds");
  assert.equal(titleFor(`wallet=${WALLET}&action=send&step=review`), "Send funds (review)");
  assert.equal(titleFor(`wallet=${WALLET}&action=add-funds&step=configure`), "Add funds");
  assert.equal(
    titleFor(`wallet=${WALLET}&action=wallet-settings&task=settings-wallet-name&step=configure`),
    "Wallet name"
  );
  assert.equal(titleFor(""), null);
});
