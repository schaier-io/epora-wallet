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

/**
 * `@meshsdk/core` carries the Cardano serialisation stack: it built to a single 6.4 MB client
 * chunk in the production build this test was written against. The root layout's client
 * components load on every route, so one value import anywhere in their graph puts that chunk
 * on pages that never touch a wallet, including the 404 shell. `wallet-provider.tsx` did
 * exactly that until it moved the three runtime uses behind `await import("@meshsdk/core")`.
 *
 * Feature pages import the SDK through their own code and were outside the original boundary;
 * the `/user` workspace shipped the same 6 MB chunk to every visit before its tree was held to
 * the same rule (issue #410). `/payee` and `/setup` still need that treatment; until then the
 * SDK stays behind dynamic imports only where a page boundary enforces it.
 */
const LAYOUT_BOUNDARY = "no root-layout module imports the Mesh SDK for a value";
// /payee and /setup still reach the SDK through their own module trees; they need
// the same page-boundary treatment the /user workspace got (issue #410 covers /user).
const PAGE_BOUNDARIES: Record<string, string> = {
  "app/user/page.tsx": "no /user page module imports the Mesh SDK for a value"
};

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

/** Also catches static value imports of `@/lib/mesh/cst`, the app's `@meshsdk/core-cst` re-export. */
const CST_MODULE = join(SRC, "lib/mesh/cst.ts");

function boundaryOffenders(entry: string) {
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
      if (next === CST_MODULE) {
        const chain: string[] = [];
        for (let cursor: string | undefined = file; cursor; cursor = parents.get(cursor)) {
          chain.unshift(cursor.slice(SRC.length + 1));
        }
        offenders.push(`@/lib/mesh/cst (deserializeTx, ...)\n    ${chain.join("\n    -> ")}`);
        continue;
      }
      parents.set(next, file);
      walk(next);
    }
  };

  walk(entry);
  return { visited, offenders };
}

test(LAYOUT_BOUNDARY, () => {
  const { visited, offenders } = boundaryOffenders(join(SRC, "app/layout.tsx"));

  assert.ok(visited.size > 20, `expected to walk the layout graph, walked ${visited.size}`);
  assert.deepEqual(
    offenders,
    [],
    `Mesh SDK reached from the root layout:\n\n${offenders.join("\n\n")}\n`
  );
});

for (const [page, name] of Object.entries(PAGE_BOUNDARIES)) {
  test(name, () => {
    // Small floor: the workspace sits behind the page's dynamic boundary, so the
    // static graph is the shell plus the modules the server entry imports.
    const { visited, offenders } = boundaryOffenders(join(SRC, page));

    assert.ok(visited.size > 10, `expected to walk the ${page} graph, walked ${visited.size}`);
    assert.deepEqual(
      offenders,
      [],
      `Mesh SDK reached from ${page}:\n\n${offenders.join("\n\n")}\n`
    );
  });
}
