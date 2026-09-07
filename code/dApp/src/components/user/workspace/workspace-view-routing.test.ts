import assert from "node:assert/strict";
import test from "node:test";

import { shouldForwardToWalletSelection } from "@/components/user/workspace/workspace-view-routing";

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
