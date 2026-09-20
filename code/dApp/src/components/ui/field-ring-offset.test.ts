import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourceRoot = new URL("./", import.meta.url);

function readSource(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, sourceRoot)), "utf8");
}

test("field primitives offset the focus ring to the card, not the page", () => {
  for (const path of ["input.tsx", "textarea.tsx", "select.tsx"]) {
    const source = readSource(path);
    assert.match(source, /ring-offset-card/, `${path} missing ring-offset-card`);
    assert.doesNotMatch(
      source,
      /ring-offset-background/,
      `${path} still uses ring-offset-background`
    );
  }
});
