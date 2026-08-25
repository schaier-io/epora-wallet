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
 *
 * `ROOTS` covered only `src/components/user` and `src/lib/user-flow`, and every term that had
 * survived the migration was living just outside them: the `/payee` page, its view, and the
 * route files under `src/app`. Widening the roots is most of what this guard needed. It is
 * still not the whole app: 21 lines under `src/lib/contracts` and `src/lib/mesh` say
 * "streaming payment", and some of those reach a user as a validation message. Fixing them is
 * a copy job of its own, not a rename, which is why the roots stop where they do.
 *
 * The timer is the same story and worse: §3.2 A counted ELEVEN terms for it, including `safety
 * timer`, `safety window`, `safety unlock time`, `Activity check` and `Owner check-in`. The
 * winner is `wake-up timer`, the only one that says what the thing does. `check-in` survives as
 * a verb ("each check-in extends the wake-up timer by"), which is why only the labels are here.
 *
 * §3.2 B, C, D and G settle four more: the approvals object is an `approval request` (never the
 * unintroduced abbreviation `multi-sig`; the spelled-out `multi-signature` stays legal on the
 * marketing surfaces, which is why the pattern ends at a word boundary), the UTxO container is a
 * `fund pool`, roles are named (`spender`, `co-signers`) instead of described (`eligible user`,
 * `rule driven`), and the address is the `wallet address`, never the raw `locking contract`.
 */

const ROOTS = ["src/app", "src/components/payee", "src/components/user", "src/lib/user-flow"];

// Each entry: the phrasing that lost, and the phrasing that won. Matching the multi-word form
// is what keeps identifiers legal — `streamingPayments` and `proofOfLifeUnlockTime` have no
// space in them, and only rendered prose does.
const BANNED_TERMS: ReadonlyArray<{ pattern: RegExp; instead: string }> = [
  // `[)\s]` and not `\W`: `manage-streaming-payments` is an identifier and must stay legal,
  // while "scheduled (streaming) payments" is the same banned term wearing a parenthesis.
  { pattern: /streaming[)\s]+payments?/i, instead: 'say "scheduled payment" (README.md:107)' },
  { pattern: /\bstreams? to\b/i, instead: 'say "sends on a schedule" (README.md:107)' },
  { pattern: /\bquorum\b/i, instead: 'say "co-signers" (§3.2 B)' },
  { pattern: /safety (timer|window|unlock|settings|rules)/i, instead: 'say "wake-up timer"' },
  { pattern: /activity check/i, instead: 'say "wake-up timer"' },
  { pattern: /proof of life/i, instead: 'say "wake-up timer"' },
  { pattern: /multi-sig\b/i, instead: 'say "approval request" (§3.2 B)' },
  { pattern: /group approval/i, instead: 'say "co-signers" (§3.2 B)' },
  { pattern: /eligible user|rule driven/i, instead: 'name the role: "spender", "co-signers" (§3.2 D)' },
  // `allowance users?` and `spending users?` need the space for the same reason `streaming
  // payments?` does: `people-spending-users` is a task id and has to stay legal.
  { pattern: /allowance users?|spending users?/i, instead: 'say "spender" (§3.2 D)' },
  // Not a bare `beneficiary`: the word is the on-chain field name, so it is everywhere as an
  // identifier, a union member and a property. These four are the shapes it took in prose.
  { pattern: /beneficiar(y|ies) (path|settings|access|withdrawal|are|should)/i, instead: 'say "recovery contact" (§3.2 F)' },
  { pattern: /wallet funding entr|receipt code \+ index/i, instead: 'say "fund pool" (§3.2 C)' },
  { pattern: /wallet[- ]script utxos?|locked contract inputs?|locking-contract utxos?/i, instead: 'say "fund pool" (§3.2 C)' },
  { pattern: /locking contract|deposit address/i, instead: 'say "wallet address" (§3.2 G)' },
  { pattern: /locked inputs?\b/i, instead: 'say "fund pool" (§3.2 C)' },
  // Narrow on purpose. `permission-wallet` is the codebase's own name and it is all over
  // import paths and one localStorage key, so a bare pattern would flag fifteen legitimate
  // lines. What leaked into prose was the React tree's name used as a role qualifier
  // ("the permission-wallet admin path"), and every module path has a hyphen where this
  // needs a space.
  { pattern: /permission-wallet (admin|owner|spender|beneficiary)/i, instead: 'say "smart wallet" and let the path badges name the role (§3.2 D)' },
  // Not a term but the same failure: a string that never decided what it says. `(s)` is what
  // a draft summary prints when nobody wrote the plural, and `formatCountLabel` exists to
  // write it. The sentinel `IMPLICIT_LOCKED_INPUT_SURFACE_LABEL` is compared, never rendered,
  // so it is held to the term above only because keeping one spelling costs nothing.
  { pattern: /\(s\)/, instead: 'use formatCountLabel(count, singular) instead of the "(s)" stub' }
];

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

for (const { pattern, instead } of BANNED_TERMS) {
  test(`no user-visible surface matches ${pattern.source}`, () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const path of sourceFiles(root)) {
        readFileSync(path, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (pattern.test(stripComments(line))) {
              offenders.push(`${path}:${index + 1} ${line.trim()}`);
            }
          });
      }
    }

    assert.deepEqual(offenders, [], `${instead}:\n${offenders.join("\n")}`);
  });
}
