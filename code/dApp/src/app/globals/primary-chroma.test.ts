import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const globalsCss = readFileSync(
  fileURLToPath(new URL("../globals.css", import.meta.url)),
  "utf8"
);

function declaredPrimary(selector: string): { L: number; C: number; h: number } {
  const start = globalsCss.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} block not found in globals.css`);
  const end = globalsCss.indexOf("\n}", start);
  assert.notEqual(end, -1, `${selector} block is not closed`);
  const block = globalsCss.slice(start, end);
  const match = block.match(/--primary:\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  assert.ok(match, `${selector} --primary is not a declared oklch() color`);
  return { L: Number(match[1]), C: Number(match[2]), h: Number(match[3]) };
}

test("--primary has non-zero chroma in :root and .dark", () => {
  const root = declaredPrimary(":root");
  const dark = declaredPrimary(".dark");
  assert.ok(root.C > 0, `:root --primary chroma is ${root.C}`);
  assert.ok(dark.C > 0, `.dark --primary chroma is ${dark.C}`);
});
