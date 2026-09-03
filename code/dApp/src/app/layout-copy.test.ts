import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

/**
 * The root layout carried one hard-coded English string, the "Skip to content" link. Every
 * other visible string in the app comes from the message catalog. The copy scanners behind
 * `pnpm i18n:check` walk `src/`, but they did not report this one, so the check passed with
 * it in place.
 *
 * This reads the layout the same way those scanners read the rest of the tree: any JSX text
 * that reads like a sentence belongs in the catalog.
 */

const layoutPath = fileURLToPath(new URL("./layout.tsx", import.meta.url));

function jsxTextNodes(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      // A sentence, not punctuation or a stray brace left between expressions.
      if (/[A-Za-z]/.test(text) && text.includes(" ")) found.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("the root layout holds no hard-coded copy", () => {
  const source = ts.createSourceFile(
    layoutPath,
    readFileSync(layoutPath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  // Guards the guard: a parser change that returns nothing must not read as a pass.
  assert.ok(source.statements.length > 10, "layout.tsx did not parse");
  assert.deepEqual(jsxTextNodes(source), []);
});
