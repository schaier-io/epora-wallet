import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * One term per concept, held by a test.
 *
 * `README.md:107` mandates "scheduled payments". The code did not obey it: the sidebar said
 * `Streaming payments`, the wallet home said `schedules`, the nav said `Payments to me` and the
 * `/payee` page said `Scheduled payments to you` — four names for one thing, in one product.
 * The audit (`.audit/ux-2026-08-20/audit-copy.md` §3.2 F) picked the README's term.
 *
 * `streaming` survives in code identifiers (`streamingPayments`, `manage-streaming-payments`,
 * the on-chain action names), which is why this looks for the two-word phrase: an identifier
 * never contains a space. The contract and transaction layers keep their own diagnostic
 * wording and are deliberately out of scope here — those strings name the on-chain action.
 */

const ROOTS = ["src/components/user", "src/lib/user-flow"];
const BANNED = /streaming payments?/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    const isSource = /\.tsx?$/.test(entry) && !entry.includes(".test.");
    return isSource ? [path] : [];
  });
}

// Comments may still discuss the on-chain concept; only what can render is held to the term.
// A block comment's continuation lines start with `*`, so they are dropped whole.
function stripComments(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
    return "";
  }
  return line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
}

test("no user-visible surface says streaming payment", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const path of sourceFiles(root)) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (BANNED.test(stripComments(line))) {
            offenders.push(`${path}:${index + 1} ${line.trim()}`);
          }
        });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `use "scheduled payment" (README.md:107); "streaming" belongs in identifiers only:\n${offenders.join(
      "\n"
    )}`
  );
});
