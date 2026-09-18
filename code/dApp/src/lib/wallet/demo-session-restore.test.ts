import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSavedDemoSessionRestore } from "./demo-session-restore";

test("waits while discovery has not settled, whatever the list shows", () => {
  assert.equal(
    decideSavedDemoSessionRestore({ walletsLoaded: false, demoWalletDiscovered: true }),
    "wait"
  );
  assert.equal(
    decideSavedDemoSessionRestore({ walletsLoaded: false, demoWalletDiscovered: false }),
    "wait"
  );
});

test("restores when discovery settled and the demo wallet is offered", () => {
  assert.equal(
    decideSavedDemoSessionRestore({ walletsLoaded: true, demoWalletDiscovered: true }),
    "restore"
  );
});

test("abandons when discovery settled and the demo wallet is hidden", () => {
  // Real extensions installed: `withDemoWalletFallback` strips the demo wallet, so
  // the saved session can never rejoin the list and the wait must end.
  assert.equal(
    decideSavedDemoSessionRestore({ walletsLoaded: true, demoWalletDiscovered: false }),
    "abandon"
  );
});
