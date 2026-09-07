import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * A fill token and its `-foreground` partner are one decision, not two. The dark theme lifts
 * a fill so it also reads as text on a dark surface, and that lift changes what can sit on
 * top of it. Overriding one without the other leaves the pair mismatched.
 *
 * `--destructive` is where this went wrong. The dark theme raised it to
 * `oklch(0.704 0.191 22.216)` and kept the light theme's near-white foreground, so
 * `variant="destructive"` painted white on a light red: 2.77:1, under the 3:1 floor for
 * large text and well under the 4.5:1 one for body text.
 */

const globalsCss = readFileSync(
  fileURLToPath(new URL("../globals.css", import.meta.url)),
  "utf8"
);

function declaredTokens(selector: string): Set<string> {
  const start = globalsCss.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} block not found in globals.css`);
  const end = globalsCss.indexOf("\n}", start);
  assert.notEqual(end, -1, `${selector} block is not closed`);
  const block = globalsCss.slice(start, end);
  return new Set(Array.from(block.matchAll(/^\s*(--[\w-]+)\s*:/gm), (match) => match[1]!));
}

const rootTokens = declaredTokens(":root");
const darkTokens = declaredTokens(".dark");

test("the dark theme overrides both halves of every fill/foreground pair", () => {
  const pairs = Array.from(rootTokens)
    .filter((token) => token.endsWith("-foreground"))
    .map((foreground) => ({
      foreground,
      fill: foreground.slice(0, -"-foreground".length)
    }))
    .filter(({ fill }) => rootTokens.has(fill));

  // Guards the guard: a rename that breaks the parser must not turn this into a test of
  // nothing.
  assert.ok(pairs.length >= 6, `expected several pairs, parsed ${pairs.length}`);

  const halfOverridden = pairs
    .filter(({ fill, foreground }) => darkTokens.has(fill) !== darkTokens.has(foreground))
    .map(({ fill, foreground }) =>
      darkTokens.has(fill) ? `${fill} without ${foreground}` : `${foreground} without ${fill}`
    );

  assert.deepEqual(halfOverridden, []);
});
