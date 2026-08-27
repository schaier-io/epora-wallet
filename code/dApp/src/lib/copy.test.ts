import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { COPY } from "@/lib/copy";

const SRC_DIR = path.join(process.cwd(), "src");
const SELF = path.join(SRC_DIR, "lib", "copy.test.ts");
const DEFINITION = path.join(SRC_DIR, "lib", "copy.ts");

/** Every leaf path under an object, as `group.key`. Arrays count as leaves. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key)
  );
}

function readSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return readSourceFiles(full);
    if (full === SELF || full === DEFINITION) return [];
    if (!/\.tsx?$/.test(full)) return [];
    return [readFileSync(full, "utf8")];
  });
}

/**
 * `copy.ts` once held 111 keys, of which 94 had no consumer, and the wording in the dead
 * ones had silently drifted away from the wording that shipped. A dictionary nobody reads is
 * worse than no dictionary: it looks like the place where the product's words are decided.
 * This test is the thing that stops it growing back.
 */
test("every COPY key has a consumer", () => {
  const sources = readSourceFiles(SRC_DIR);
  const orphans = leafPaths(COPY, "COPY").filter((keyPath) => {
    // The trailing boundary matters: without it `COPY.brand.name` would look used by a file
    // that only reads `COPY.brand.nameDisplay`.
    const usage = new RegExp(`${keyPath.replace(/\./g, "\\.")}(?![\\w$])`);
    return !sources.some((source) => usage.test(source));
  });

  assert.deepEqual(
    orphans,
    [],
    `unused copy keys. Delete them, or move the wording to the surface that renders it:\n${orphans.join("\n")}`
  );
});
