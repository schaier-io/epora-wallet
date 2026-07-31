#!/usr/bin/env node
// Failure-diagnosability gate for CLAUDE.md §9.
//
// §9 requires every conjunct of an `and { … }` block whose `False` means
// REJECTION to carry the trace-if-false operator (`?`), so a failing validator
// names the exact conjunct that went `False` instead of just "failed". The rule
// costs nothing on-chain (`aiken build` erases traces at its default
// `--trace-level silent`) but it was enforced only by reviewer memory, and a
// missed `?` is invisible until the day someone is debugging a rejection.
//
// This checks it mechanically. `or { … }` blocks are deliberately NOT checked:
// there a `False` is a normal path miss, and §9 forbids `?` on them.
//
// Usage: node scripts/check-traces.mjs
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Test files and test scaffolding are exempt: a fixture's `and` block is not a
// rejection path, and `expect` already traces its own source (§9).
const files = execSync(
  "grep -rl 'and {' lib validators --include='*.ak'",
  { cwd: projectRoot, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter((f) => f.length > 0)
  .filter((f) => !f.endsWith("_tests.ak") && !f.includes("test_support/"));

/** Split on top-level commas, tracking bracket depth and skipping strings. */
function splitConjuncts(body) {
  const parts = [];
  let depth = 0;
  let current = "";
  let inString = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '"' && body[i - 1] !== "\\") inString = !inString;
    if (!inString) {
      if ("([{".includes(ch)) depth += 1;
      if (")]}".includes(ch)) depth -= 1;
      if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  parts.push(current);
  return parts.filter((p) => p.trim().length > 0);
}

/** Strip `//` line comments so a trailing comment can't fake a `?`. */
function stripComments(text) {
  return text
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
}

/** True when the declaration enclosing `offset` is a `test` block. */
function insideTest(source, offset) {
  const declaration = source
    .slice(0, offset)
    .split("\n")
    .reverse()
    .find((line) => /^(test|fn|pub fn|validator)\b/.test(line));
  return declaration !== undefined && /^test\b/.test(declaration);
}

/**
 * True when the block is annotated as a §9 scan-predicate exemption. §9 forbids
 * `?` on a `list.find`/`list.any` match key, and the convention already in the
 * tree is to say so in a comment right above the block.
 */
function isExempted(source, start) {
  const preceding = source.slice(0, start).split("\n").slice(-8).join("\n");
  return /(§9|rule 9)/i.test(preceding);
}

const violations = [];

for (const rel of files) {
  const source = readFileSync(join(projectRoot, rel), "utf8");
  let index = 0;
  while (true) {
    const start = source.indexOf("and {", index);
    if (start === -1) break;
    index = start + 5;
    if (insideTest(source, start) || isExempted(source, start)) continue;

    // Walk to the matching close brace.
    let depth = 1;
    let cursor = start + 4;
    while (depth > 0 && cursor < source.length) {
      cursor += 1;
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
    }
    const body = stripComments(source.slice(start + 5, cursor));
    const line = source.slice(0, start).split("\n").length;

    for (const conjunct of splitConjuncts(body)) {
      const text = conjunct.trim();
      // Nested blocks and match expressions are checked on their own terms:
      // an inner `and {` gets its own pass, an `or {`/`when`/`if` is a path
      // selector whose `False` is a miss, not a violation.
      if (/^(or|and|when|if|expect)\b/.test(text)) continue;
      // An `expect_*` helper raises (and traces) from inside itself, so the
      // call site adds nothing by re-tracing the same failure.
      if (/^[\w.]*\bexpect_\w+\(/.test(text)) continue;
      if (text.endsWith("?")) continue;
      // A `{ let … <expr>? }` block conjunct traces on its final expression.
      if (text.startsWith("{") && text.replace(/}$/, "").trim().endsWith("?"))
        continue;
      violations.push({
        file: rel,
        line: line + body.slice(0, body.indexOf(conjunct)).split("\n").length - 1,
        text: text.replace(/\s+/g, " ").slice(0, 90),
      });
    }
  }
}

if (violations.length > 0) {
  console.error(
    "check-traces: rejection conjunct(s) without the `?` trace operator (CLAUDE.md §9)\n",
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}\n    ${v.text}`);
  }
  console.error(
    "\nAdd `?` so a rejection names the failing conjunct (parenthesize compound\n" +
      "expressions: `(a <= b)?`). If this conjunct is a path selector rather than a\n" +
      "rejection, it belongs in an `or { … }` block, which this gate skips.",
  );
  process.exit(1);
}

console.log(
  `check-traces: every rejection conjunct in ${files.length} module(s) is traced`,
);
