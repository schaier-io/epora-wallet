import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearProposalDraft,
  readProposalDraft,
  writeProposalDraft,
  type StashedProposalDraft
} from "@/components/user/proposals/stash";

const STASH_KEY = "pw:proposal-draft";

// node:test runs without a DOM, and jsdom's own storage is unusable here (see
// the `dapp-jsdom-localstorage-broken` note), so the module gets a stub window.
function installStorage() {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    value: {
      sessionStorage: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
        removeItem: (key: string) => entries.delete(key)
      }
    },
    configurable: true,
    writable: true
  });
  return entries;
}

function draft(): StashedProposalDraft {
  return {
    walletUnit: `${"aa".repeat(28)}01`,
    walletPolicyId: "aa".repeat(28),
    actionKind: "use",
    authorityPath: "multisig",
    builder: "stt-spend",
    buildContext: { builder: "stt-spend" } as unknown as StashedProposalDraft["buildContext"],
    unsignedTxHex: "80"
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("proposal draft stash", () => {
  it("round-trips a draft this build wrote", () => {
    installStorage();

    writeProposalDraft(draft());

    assert.deepEqual(readProposalDraft(), draft());
  });

  it("drops a draft an older build wrote", () => {
    // sessionStorage outlives a deploy inside the same tab. The old shape was
    // stored bare, with no version around it.
    const entries = installStorage();
    entries.set(STASH_KEY, JSON.stringify({ walletUnit: "unit", actionKind: "use" }));

    assert.equal(readProposalDraft(), null);
  });

  it("drops a stored draft that is missing the transaction", () => {
    const entries = installStorage();
    const { unsignedTxHex: _dropped, ...withoutTx } = draft();
    entries.set(STASH_KEY, JSON.stringify({ version: 1, draft: withoutTx }));

    assert.equal(readProposalDraft(), null);
  });

  it("clears the stash", () => {
    installStorage();
    writeProposalDraft(draft());

    clearProposalDraft();

    assert.equal(readProposalDraft(), null);
  });
});
