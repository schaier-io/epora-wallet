import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * `buttonVariants` is mobile-first: every size reads `h-11 ... sm:h-<smaller>`, so a control
 * is 44px under a finger and smaller under a mouse.
 *
 * A `className` that sets an unprefixed height inverts that. `tailwind-merge` drops the
 * conflicting `h-11` and keeps the `sm:` rule, because the two sit in different variant
 * scopes. Measured in the browser, before this rule was enforced:
 *
 *   "Now" (guided date field)   24px at 375px wide, 40px at 768px
 *   certificate buttons         28px at 375px wide, 36px at 768px
 *
 * The override was also dead where it was aimed: on a desktop the button kept the size the
 * variant gave it. To shrink a button on larger screens, set both scopes (`h-8 sm:h-8`) or
 * prefix the height alone (`sm:h-7`). Setting both is a deliberate, consistent size, so this
 * rule leaves it alone.
 */

const componentsDir = fileURLToPath(new URL("../..", import.meta.url));
const UNPREFIXED_SHORT_HEIGHT = /(?:^|\s)h-(\d+|px)(?=\s|$)/g;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* sourceFiles(path);
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      yield path;
    }
  }
}

/** The tag a `className` belongs to: the last tag opened before it, since JSX attribute
 *  values cannot contain `<`. */
function owningTag(source: string, classNameIndex: number): string | null {
  const before = source.slice(0, classNameIndex);
  const open = before.lastIndexOf("<");
  if (open === -1) return null;
  return /^<([A-Za-z][\w.]*)/.exec(before.slice(open))?.[1] ?? null;
}

function tooShort(classes: string): boolean {
  // An author who also set the `sm:` height chose one size for every width. Nothing is
  // inverted, so there is nothing to report.
  if (/(?:^|\s)sm:h-(?:\d+|px)(?=\s|$)/.test(classes)) return false;

  for (const match of classes.matchAll(UNPREFIXED_SHORT_HEIGHT)) {
    const value = match[1]!;
    if (value === "px") return true;
    if (Number(value) < 11) return true;
  }
  return false;
}

test("no Button shrinks its height on touch screens", () => {
  const offenders: string[] = [];
  let scanned = 0;

  for (const file of sourceFiles(componentsDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/className="([^"]*)"/g)) {
      if (owningTag(source, match.index) !== "Button") continue;
      scanned += 1;
      if (tooShort(match[1]!)) {
        offenders.push(`${file.slice(componentsDir.length + 1)}: ${match[1]}`);
      }
    }
  }

  // Guards the guard: a parser that stops matching must not read as a clean result.
  assert.ok(scanned >= 20, `expected many Button className strings, scanned ${scanned}`);
  assert.deepEqual(offenders, []);
});
