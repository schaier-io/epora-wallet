import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const animationsCss = readFileSync(
  fileURLToPath(new URL("./animations.css", import.meta.url)),
  "utf8"
);

test("lucide icons use stroke-width 3 so h-4 matches font-semibold stems", () => {
  assert.match(animationsCss, /svg\.lucide\s*\{\s*stroke-width:\s*3;\s*\}/);
});
