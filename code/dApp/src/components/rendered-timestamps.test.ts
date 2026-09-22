import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * No raw ISO 8601 string is rendered to a reader.
 *
 * `payee-view.tsx` showed the stop time in its confirmation dialog as
 * `new Date(stopReview.cutoff).toISOString()`: UTC, with no zone named, in a mono face, on
 * the one number a reader checks before stopping their own income. The same file's import
 * comment already says why that is wrong -- the app formats in `defaultTimeZone`
 * (`i18n/config.ts`), not the browser's, so a host-zone render also makes the client
 * disagree with the server's HTML -- and the payment's own start and end dates 100 lines
 * above were already going through `formatTimestampLabel`.
 *
 * `formatTimestampLabel` names the zone, which is what stops the number being read as the
 * reader's own wall clock.
 *
 * **What this cannot see.** It matches `toISOString()` inside a JSX expression only. An ISO
 * string assigned to a variable on one line and rendered on another passes this guard
 * untouched, as does one built inside a helper. It is a cheap net for the common shape, not
 * a proof that every rendered time is formatted.
 *
 * Deliberately not matched: `${...}` template holes, so a download filename
 * (`workspace-transactions-view.tsx:85`) and a CSV column stay allowed. Those are file
 * contents and filenames, not text on a screen.
 *
 * Two false positives shaped the two lines below, and both are worth naming because the
 * obvious regex has them:
 *
 * - Comments are stripped first. The fix for `payee-view.tsx` left a comment explaining why
 *   `toISOString()` was wrong there, and inside `{/* ... *\/}` that comment is itself a JSX
 *   expression containing the banned call. A guard that fails on the note explaining the fix
 *   is worse than no guard.
 * - The character class excludes newlines. `[^{}]` matches a newline, so the pattern happily
 *   spanned from a function's opening brace several lines up to an ordinary
 *   `const now = new Date().toISOString();` in `build-errors.ts`. A JSX expression that
 *   renders a value sits on one line.
 */
const ROOTS = ["src/components", "src/app"];
const RENDERED_ISO = /(?<!\$)\{[^{}\n]*toISOString\(\)/;

// Block comments, and line comments that own their line. A `//` mid-line is left alone so a
// URL inside a string cannot swallow the rest of that line and hide a real hit.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

test("no component renders a raw ISO timestamp", () => {
  const offenders = ROOTS.flatMap(sourceFiles).filter((file) =>
    RENDERED_ISO.test(withoutComments(readFileSync(file, "utf8")))
  );

  assert.deepEqual(
    offenders,
    [],
    `Render the date through formatTimestampLabel, which names the configured zone: ${offenders.join(", ")}`
  );
});
