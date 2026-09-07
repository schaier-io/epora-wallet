import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `hsl(var(--token))` is invalid for a token that already holds a complete color.
 *
 * The theme tokens hold `oklch()` values. Wrapping one in `hsl()` makes the declaration
 * invalid at computed-value time, so it resets to the property's initial value and paints
 * nothing at all. Measured in the running app before this guard existed:
 *
 *   box-shadow: 0 0 0 1px hsl(var(--primary)/0.25)   -> none
 *   background-color: hsl(var(--primary) / 0.18)     -> rgba(0, 0, 0, 0)
 *
 * `globals.css` already carried a comment describing the trap, written when the recharts
 * axis ticks fell back to black. The comment did not stop it recurring: three keyframe
 * animations (`tile-bump`, `pill-pulse`, `copy-pulse`) and three selected-state rings still
 * used the pattern, so a picked wallet, an active task chip and the newest-activity halo all
 * rendered with no ring and no fill. `color-mix(in oklch, var(--token) N%, transparent)`
 * is the working form and is what the rest of the codebase uses.
 *
 * The token list is read from `globals.css` rather than hardcoded, so a token that is
 * converted to `oklch()` later is covered the day it converts. Tokens that genuinely hold an
 * HSL triplet (`--brand-teal` and friends) stay legal under `hsl()` and are not flagged.
 */

const SRC = join(import.meta.dirname, "..", "..");
const GLOBALS = join(import.meta.dirname, "..", "globals.css");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === "generated" || entry === "node_modules") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(css|tsx?)$/.test(entry) ? [path] : [];
  });
}

/** Tokens whose value is a complete color function, so `hsl()` around them is invalid. */
function completeColorTokens(): string[] {
  const css = readFileSync(GLOBALS, "utf8");
  const tokens = new Set<string>();
  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (/\b(?:oklch|oklab|lab|lch|color|color-mix|rgb|hsl)\(/.test(value)) {
      tokens.add(name);
    }
  }
  return [...tokens];
}

test("no theme token that holds a complete color is wrapped in hsl()", () => {
  const tokens = completeColorTokens();
  assert.ok(tokens.length > 0, "expected to read theme tokens out of globals.css");

  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    // This file quotes the broken form in its own comment, and the detector is right to
    // see it: skipping the guard itself is the only exclusion.
    if (file === import.meta.filename) continue;
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      for (const token of tokens) {
        // Matches both the CSS form and Tailwind's underscore-separated arbitrary values.
        if (new RegExp(`hsl\\(\\s*var\\(${token}\\)`).test(line)) {
          offenders.push(`${file.slice(SRC.length + 1)}:${index + 1}  ${line.trim()}`);
        }
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `hsl() around a token that already holds a complete color computes to nothing. ` +
      `Use color-mix(in oklch, var(--token) N%, transparent) instead:\n${offenders.join("\n")}`
  );
});
