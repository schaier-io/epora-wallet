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
import { fitProposalSummaryForStorage, writeProposalDraft } from "./stash";

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
