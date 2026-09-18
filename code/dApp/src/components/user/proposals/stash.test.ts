import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SUMMARY_CELL_LENGTH,
  MAX_SUMMARY_HEADLINE_LENGTH,
  MAX_SUMMARY_ROWS,
  MAX_SUMMARY_BYTES,
  MAX_UNSIGNED_TX_BYTES,
  utf8ByteLength
} from "@/lib/proposals/limits";
import { CARDANO_MAX_TX_SIZE_BYTES } from "@/lib/mesh/transactions/internals/constants";
import { EMPTY_CONTRACT_CONFIG } from "@/lib/types/contracts";
import { clearProposalDraft, fitProposalSummaryForStorage, readProposalDraft, writeProposalDraft, type StashedProposalDraft } from "./stash";

test("saved proposal transaction bytes use the ledger transaction-size limit", () => {
  assert.equal(MAX_UNSIGNED_TX_BYTES, CARDANO_MAX_TX_SIZE_BYTES);
});

test("proposal receipt metadata does not limit the transaction's output count", () => {
  const summary = fitProposalSummaryForStorage({
    headline: "h".repeat(MAX_SUMMARY_HEADLINE_LENGTH + 1),
    rows: Array.from({ length: MAX_SUMMARY_ROWS + 10 }, (_, index) => ({
      label: `Recipient ${index + 1}`,
      value: "v".repeat(MAX_SUMMARY_CELL_LENGTH + 1)
    }))
  });

  assert.equal(summary.headline.length, MAX_SUMMARY_HEADLINE_LENGTH);
  assert.ok(summary.rows.length <= MAX_SUMMARY_ROWS);
  assert.ok(summary.rows.every((row) => row.value.length <= MAX_SUMMARY_CELL_LENGTH));
  assert.ok(utf8ByteLength(JSON.stringify(summary)) <= MAX_SUMMARY_BYTES);
});

test("browser draft storage does not require the Node Buffer global", () => {
  const bufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  let stored: string | null = null;

  Object.defineProperty(globalThis, "Buffer", {
    configurable: true,
    value: undefined
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        setItem: (_key: string, value: string) => {
          stored = value;
        }
      }
    }
  });

  try {
    writeProposalDraft({
      walletUnit: "policy.asset",
      walletPolicyId: "policy",
      actionKind: "use",
      authorityPath: "admin",
      builder: "stt-spend",
      buildContext: {
        builder: "mint",
        config: EMPTY_CONTRACT_CONFIG,
        input: { stateDatum: { alternative: 0, fields: [] } }
      },
      unsignedTxHex: "00",
      summary: {
        headline: "Browser draft",
        rows: [{ label: "Recipient", value: "Alice" }]
      }
    });
    assert.notEqual(stored, null);
  } finally {
    if (bufferDescriptor) {
      Object.defineProperty(globalThis, "Buffer", bufferDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "Buffer");
    }
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

function withDraftStorage(run: (entries: Map<string, string>) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
        removeItem: (key: string) => entries.delete(key)
      }
    }
  });
  try {
    run(entries);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

function draft(): StashedProposalDraft {
  return {
    walletUnit: "policy.asset",
    walletPolicyId: "policy",
    actionKind: "mint",
    authorityPath: "admin",
    builder: "mint",
    buildContext: {
      builder: "mint",
      config: EMPTY_CONTRACT_CONFIG,
      input: { stateDatum: { alternative: 0, fields: [] } }
    },
    unsignedTxHex: "80",
    proposerKeyHash: "ab".repeat(28)
  };
}

test("proposal drafts round-trip the current version and captured signer", () => {
  withDraftStorage(() => {
    writeProposalDraft(draft());
    const stored = readProposalDraft();
    assert.match(stored?.draftId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const { draftId: _stamp, ...withoutStamp } = stored!;
    assert.deepEqual(withoutStamp, draft());
  });
});

test("every stashed draft gets its own identity stamp", () => {
  withDraftStorage(() => {
    writeProposalDraft(draft());
    const first = readProposalDraft();
    writeProposalDraft(draft());
    const second = readProposalDraft();
    assert.notEqual(first?.draftId, second?.draftId);
  });
});

test("a late save cannot clear a newer draft", () => {
  withDraftStorage(() => {
    // The user stashes a draft, its save starts, they navigate away and build
    // again (a new draft is stashed), then the old save resolves and clears.
    writeProposalDraft(draft());
    const staleDraftId = readProposalDraft()?.draftId;
    writeProposalDraft({ ...draft(), unsignedTxHex: "81" });
    clearProposalDraft(staleDraftId);
    assert.equal(readProposalDraft()?.unsignedTxHex, "81");
    // The newer draft's own save still clears it.
    clearProposalDraft(readProposalDraft()?.draftId);
    assert.equal(readProposalDraft(), null);
  });
});

test("a draft stored without an identity stamp still clears on save", () => {
  withDraftStorage((entries) => {
    entries.set("pw:proposal-draft", JSON.stringify({ version: 1, draft: draft() }));
    clearProposalDraft(readProposalDraft()?.draftId);
    assert.equal(readProposalDraft(), null);
  });
});

test("a legacy draft is stamped on read, so its late save cannot delete a newer draft", () => {
  withDraftStorage((entries) => {
    entries.set("pw:proposal-draft", JSON.stringify({ version: 1, draft: draft() }));
    // The panel mounts post-deploy and reads the pre-stamp draft: it comes
    // back with an identity that is persisted, not just returned.
    const legacy = readProposalDraft();
    assert.match(legacy?.draftId ?? "", /^[0-9a-f-]{36}$/);
    // The stamp must be persisted, not only returned: a clear checks storage,
    // so an in-memory-only stamp would make a legitimate clear skip.
    const storedAfterRead = JSON.parse(entries.get("pw:proposal-draft") ?? "{}") as {
      draft?: { draftId?: string };
    };
    assert.equal(storedAfterRead.draft?.draftId, legacy?.draftId);
    // Regression for the review finding: the save built from that read is in
    // flight, the user stashes a newer draft, then the old save resolves. The
    // identity-checked clear must not fall back to unconditional removal.
    writeProposalDraft({ ...draft(), unsignedTxHex: "81" });
    clearProposalDraft(legacy?.draftId);
    assert.equal(readProposalDraft()?.unsignedTxHex, "81");
  });
});

test("proposal draft versioning preserves summary trimming", () => {
  withDraftStorage(() => {
    writeProposalDraft({
      ...draft(),
      summary: { headline: "h".repeat(MAX_SUMMARY_HEADLINE_LENGTH + 1), rows: [] }
    });
    assert.equal(readProposalDraft()?.summary?.headline.length, MAX_SUMMARY_HEADLINE_LENGTH);
  });
});

test("proposal drafts reject old and incomplete stored shapes", () => {
  withDraftStorage((entries) => {
    entries.set("pw:proposal-draft", JSON.stringify(draft()));
    assert.equal(readProposalDraft(), null);
    const { unsignedTxHex: _omitted, ...withoutTransaction } = draft();
    entries.set("pw:proposal-draft", JSON.stringify({ version: 1, draft: withoutTransaction }));
    assert.equal(readProposalDraft(), null);
  });
});

test("proposal drafts can be cleared", () => {
  withDraftStorage(() => {
    writeProposalDraft(draft());
    clearProposalDraft();
    assert.equal(readProposalDraft(), null);
  });
});
