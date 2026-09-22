import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const typographyCss = readFileSync(
  fileURLToPath(new URL("../typography.css", import.meta.url)),
  "utf8"
);

const pageHeading = readFileSync(
  fileURLToPath(new URL("../../components/ui/page-heading.ts", import.meta.url)),
  "utf8"
);

/**
 * `typography.css` is unlayered, so every property it sets outranks the same property
 * written as a Tailwind utility at the call site, with no `!important` needed and no
 * warning. `.font-display` set `font-weight: 500`, which silently beat the `font-semibold`
 * in `pageHeadingClass`: every page title in the app rendered at 500 while DESIGN.md sets
 * the Headline rung at 1.5rem/600.
 *
 * Both halves are asserted, because either one alone passes while the pair is broken.
 */
test("the display face sets no font-weight, so call sites decide it", () => {
  const rule = typographyCss.match(/\.font-display\s*\{[^}]*\}/)?.[0];
  assert.ok(rule, ".font-display rule not found in typography.css");
  assert.doesNotMatch(rule, /font-weight/);
});

test("the eyebrow sets no font-weight, so call sites decide it", () => {
  const rule = typographyCss.match(/\.eyebrow\s*\{[^}]*\}/)?.[0];
  assert.ok(rule, ".eyebrow rule not found in typography.css");
  assert.doesNotMatch(rule, /font-weight/);
});

test("the Headline rung asks for the weight DESIGN.md gives it", () => {
  assert.match(pageHeading, /font-display/);
  assert.match(pageHeading, /font-semibold/);
});
