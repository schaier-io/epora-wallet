import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const source = readFileSync(
  fileURLToPath(new URL("./payee-card-header.tsx", import.meta.url)),
  "utf8"
);

/**
 * The header row is `flex-wrap`, but a `flex-1` child has a flex base size of 0, so it
 * shrinks to whatever is left instead of pushing the sibling onto its own line. The wrap
 * could never fire. Measured in Chrome at a 320px viewport, before the basis was added:
 *
 *   title column   140px of a 254px row, heading 86px tall (three lines)
 *   Refresh        102px, on the same line
 *
 * and after:
 *
 *   title column   254px, heading 58px tall (two lines), Refresh on its own line below
 *
 * At 1280px both readings are identical: heading on one line, Refresh at the right of the
 * same row. So the basis changes the narrow case only.
 *
 * `basis-64` is also what keeps the older bug fixed, which is why the value matters and not
 * just the presence of a basis: the comment above the div records that `min-w-0` alone left
 * the base size at max-content, which overflowed the line. A bounded 256px does neither.
 */
test("the title column carries a bounded flex basis, so the row can wrap", () => {
  const column = source.match(/className="min-w-0 flex-1[^"]*"/)?.[0];

  assert.ok(column, "the title column's className was not found");
  assert.match(
    column,
    /\bbasis-64\b/,
    "flex-1 alone bases the column at 0, so it shrinks instead of letting the row wrap"
  );
});
