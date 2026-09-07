import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const SRC = join(process.cwd(), "src");
const MESH_PACKAGES = new Set(["@meshsdk/core", "@meshsdk/core-cst"]);

/** `@/x` and `./x` to a real file. Anything else is a package, which we do not walk into. */
function resolveModule(specifier: string, importer: string) {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(importer), specifier);
  else return null;

  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + suffix)) return base + suffix;
  }
  return null;
}

/**
 * Matches `import ... from "x"` and `export ... from "x"`, capturing a leading `type` keyword
 * and the binding clause. A dynamic `await import("x")` has no `from` and is deliberately not
 * matched: deferring an import is the thing this test exists to protect.
 */
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;

function meshValueImports(source: string) {
  const found: string[] = [];
  for (const [, typeKeyword, clause, specifier] of source.matchAll(STATIC_IMPORT)) {
    if (!MESH_PACKAGES.has(specifier) || typeKeyword) continue;
    const bindings = (clause ?? "")
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((binding) => binding.trim())
      .filter((binding) => binding && !binding.startsWith("type "));
    if (bindings.length > 0) found.push(`${specifier} (${bindings.join(", ")})`);
  }
  return found;
}

/**
 * `@meshsdk/core` carries the Cardano serialisation stack: it built to a single 6.4 MB client
 * chunk in the production build this test was written against. The root layout's client
 * components load on every route, so one value import anywhere in their graph puts that chunk
 * on pages that never touch a wallet, including the 404 shell. `wallet-provider.tsx` did
 * exactly that until it moved the three runtime uses behind `await import("@meshsdk/core")`.
 *
 * Feature pages import the SDK through their own code and are outside this boundary; this test
 * guards the layout graph only.
 */
test("no root-layout module imports the Mesh SDK for a value", () => {
  const visited = new Set<string>();
  const parents = new Map<string, string>();
  const offenders: string[] = [];

  const walk = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);

    const source = readFileSync(file, "utf8");
    for (const mesh of meshValueImports(source)) {
      const chain: string[] = [];
      for (let cursor: string | undefined = file; cursor; cursor = parents.get(cursor)) {
        chain.unshift(cursor.slice(SRC.length + 1));
      }
      offenders.push(`${mesh}\n    ${chain.join("\n    -> ")}`);
    }

    for (const [, typeKeyword, , specifier] of source.matchAll(STATIC_IMPORT)) {
      if (typeKeyword || MESH_PACKAGES.has(specifier)) continue;
      const next = resolveModule(specifier, file);
      if (!next || visited.has(next)) continue;
      parents.set(next, file);
      walk(next);
    }
  };

  walk(join(SRC, "app/layout.tsx"));

  assert.ok(visited.size > 20, `expected to walk the layout graph, walked ${visited.size}`);
  assert.deepEqual(
    offenders,
    [],
    `Mesh SDK reached from the root layout:\n\n${offenders.join("\n\n")}\n`
  );
});
