import assert from "node:assert/strict";
import test from "node:test";

import { shouldForwardToWalletSelection, shouldShowDemoLookupLimit } from "@/components/user/workspace/workspace-view-routing";

/**
 * The bug this file exists for: the workspace forwarded to the wallet chooser whenever the
 * selected wallet granted the connected key no role, in every mode, including the one that
 * does not touch the selected wallet at all.
 *
 * Reproduced against a production build. Pressing "Start setup" with such a wallet selected:
 *
 *   location.search  ?wallet=67c114...&action=create-wallet&step=configure
 *   document.title   "Create wallet - Epora Wallet"
 *   header           "Create wallet - Name the wallet, choose who can use it..."
 *   body             the "Create wallet / Open wallet" chooser, unchanged
 *
 * The same URL with the `wallet` parameter removed rendered the setup form, which is what
 * pinned the cause to this rule rather than to the form.
 */

test("create-wallet opens even when the selected wallet grants no role", () => {
  assert.equal(
    shouldForwardToWalletSelection({
      workspaceMode: "new-wallet",
      selectedWalletIsUsable: false
    }),
    false
  );
});

test("an existing wallet that grants no role forwards to the chooser", () => {
  assert.equal(
    shouldForwardToWalletSelection({
      workspaceMode: "existing-wallet",
      selectedWalletIsUsable: false
    }),
    true
  );
});

test("an existing wallet the key holds a role in opens its workspace", () => {
  assert.equal(
    shouldForwardToWalletSelection({
      workspaceMode: "existing-wallet",
      selectedWalletIsUsable: true
    }),
    false
  );
});

test("landing always shows the chooser, whatever the capability map says", () => {
  for (const selectedWalletIsUsable of [true, false]) {
    assert.equal(
      shouldForwardToWalletSelection({ workspaceMode: "landing", selectedWalletIsUsable }),
      true
    );
  }
});

/**
 * The demo wallet is a read-only shim with a fake address, so its inventory lookup never
 * resolves. Measured on `/user` with the demo connected: "Detecting wallets…" ran for
 * minutes with no network request at all and no error.
 */
const demoBase = {
  workspaceMode: "landing" as const,
  detectedSttTokensLoading: true,
  isDemoWallet: true
};

test("says the demo wallet cannot look wallets up", () => {
  assert.equal(shouldShowDemoLookupLimit(demoBase), true);
});

/**
 * The whole point of scoping it to the demo: a real wallet whose lookup is slow, or
 * failing, still gets the loading state and whatever error follows. Papering over that
 * would hide a genuine failure behind a sentence about the demo.
 */
test("leaves a real wallet's lookup alone", () => {
  assert.equal(shouldShowDemoLookupLimit({ ...demoBase, isDemoWallet: false }), false);
});

test("says nothing once the lookup is no longer pending", () => {
  assert.equal(shouldShowDemoLookupLimit({ ...demoBase, detectedSttTokensLoading: false }), false);
});

test("stays out of every mode but the landing screen", () => {
  assert.equal(shouldShowDemoLookupLimit({ ...demoBase, workspaceMode: "existing-wallet" }), false);
  assert.equal(shouldShowDemoLookupLimit({ ...demoBase, workspaceMode: "new-wallet" }), false);
});
