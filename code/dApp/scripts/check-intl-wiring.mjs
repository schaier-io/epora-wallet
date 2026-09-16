/**
 * Guards the wiring the message catalogs cannot see.
 *
 * The catalog checks answer "does this key exist and is its ICU valid". They
 * cannot answer "will a provider be mounted above the component that asks for
 * it", which is the failure that took every route to HTTP 500: resolving a
 * merge in favour of the other side removed `NextIntlClientProvider` from the
 * tree, and nothing noticed, because the component tests mock
 * `useTranslations` and every route renders on demand rather than at build.
 *
 * So this walks the real import graph from each entry point and checks that
 * every namespace it reaches is one a provider above it actually ships.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("src");
const APP = path.join(SRC, "app");
const failures = [];

function readSource(file) {
  return fs.readFileSync(file, "utf8");
}

/**
 * Resolves an import to a file on disk. Both forms have to be followed: most of
 * the workspace editors and the proposals surface are reachable only through
 * relative specifiers, so an alias-only walk misses 22 namespaces, two of them
 * rendered straight from the root layout.
 */
function resolveImport(specifier, fromFile) {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts")
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * True when the `from "x"` clause at `match` belongs to a statement the compiler
 * erases: `import type ...`, `export type ...`, or a braces clause whose every
 * specifier is `type`-prefixed. An erased import never loads the module in the
 * browser, so it cannot need a provider -- following it demanded coverage for
 * namespaces no runtime code on the page can ask for (the proposals page
 * "reached" PoolFinder only through a `type StakePool` import).
 *
 * A clause is only ever skipped on a positive match; anything unparseable keeps
 * the old behaviour and is followed, so a false negative here cannot weaken the
 * guard, only keep it loud.
 */
function isTypeOnlyClause(source, match) {
  const start = source.lastIndexOf(";", match.index) + 1;
  const clause = source.slice(start, match.index).trim();
  if (/^(?:import|export)\s+type\b/.test(clause)) return true;
  const braces = clause.match(/^(?:import|export)\s*\{([^}]*)\}$/);
  if (!braces) return false;
  const specifiers = braces[1].split(",").map((specifier) => specifier.trim()).filter(Boolean);
  return specifiers.length > 0 && specifiers.every((specifier) => specifier === "type" || /^type\s/.test(specifier));
}

/**
 * Namespaces reached from `entry` that need a client provider.
 *
 * Only client modules do: `useTranslations` in a Server Component resolves on
 * the server and ships nothing. A module counts as client once the walk has
 * crossed a `"use client"` boundary, so a shared helper carries the flag from
 * whichever side imported it.
 */
function reachableNamespaces(entry) {
  const seen = new Set();
  const namespaces = new Map();
  const queue = [{ file: entry, client: false }];

  while (queue.length > 0) {
    const { file, client } = queue.pop();
    if (!file) continue;
    const key = `${file}:${client}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const source = readSource(file);
    const isClient = client || /^\s*["']use client["']/.test(source);
    if (isClient) {
      for (const match of source.matchAll(/useTranslations\(\s*"([^"]+)"/g)) {
        if (!namespaces.has(match[1])) namespaces.set(match[1], file);
      }
    }
    for (const match of source.matchAll(/from "([^"]+)"/g)) {
      if (isTypeOnlyClause(source, match)) continue;
      const resolved = resolveImport(match[1], file);
      if (resolved) queue.push({ file: resolved, client: isClient });
    }
  }

  return namespaces;
}

function relative(file) {
  return path.relative(process.cwd(), file);
}

// ---------------------------------------------------------------------------
// 1. The root layout mounts a provider, and its list covers what it renders.
// ---------------------------------------------------------------------------

const layoutFile = path.join(APP, "layout.tsx");
const layoutSource = readSource(layoutFile);

if (!layoutSource.includes("<NextIntlClientProvider")) {
  failures.push(
    `${relative(layoutFile)}: no <NextIntlClientProvider>. Every client component calling useTranslations will throw.`
  );
}

const rootListSource = readSource(path.join(SRC, "i18n/client-messages.ts"));
const rootBlock = rootListSource.match(/ROOT_CLIENT_NAMESPACES = \[([^\]]*)\]/)?.[1] ?? "";
const rootNamespaces = new Set([...rootBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]));

const layoutReach = reachableNamespaces(layoutFile);
for (const [namespace, file] of layoutReach) {
  if (!rootNamespaces.has(namespace)) {
    failures.push(
      `${relative(file)}: ${namespace} is rendered from the root layout but missing from ROOT_CLIENT_NAMESPACES.`
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Each page covers the namespaces below it, through the root list or its
//    own scoped provider's prefixes.
// ---------------------------------------------------------------------------

function findPages(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return findPages(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

for (const page of findPages(APP)) {
  const source = readSource(page);
  // A route may re-export another page module wholesale (the landing route
  // renders the user page at "/"). The provider that covers its namespaces
  // then lives in the re-exported module, so read the provider markers from
  // there too. `reachableNamespaces` already follows the same statements.
  const reexportTargets = [
    ...source.matchAll(/export\s*\{[^}]*\}\s*from\s*"([^"]+)"/g)
  ]
    .map((match) => resolveImport(match[1], page))
    .filter(Boolean)
    .map(readSource);
  const pageAndReexports = [source, ...reexportTargets].join("\n");
  const prefixes = [
    ...(pageAndReexports.match(/prefixes=\{\[([^\]]*)\]\}/)?.[1] ?? "").matchAll(/"([^"]+)"/g)
  ].map((match) => match[1]);
  const scoped = pageAndReexports.includes("<ScopedClientIntlProvider");

  for (const [namespace, file] of reachableNamespaces(page)) {
    if (rootNamespaces.has(namespace)) continue;
    if (scoped && prefixes.some((prefix) => namespace.startsWith(prefix))) continue;
    failures.push(
      `${relative(page)}: ${namespace} (used by ${relative(file)}) is covered by neither ROOT_CLIENT_NAMESPACES nor this page's provider prefixes.`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. `useTranslations` is a hook; an async component must use getTranslations.
//    This one fails the production build rather than a request, so it never
//    reaches a browser, but it also never reaches a reviewer until deploy.
// ---------------------------------------------------------------------------

function walkSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkSources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const sourceFiles = walkSources(SRC);

for (const file of sourceFiles) {
  const source = readSource(file);
  for (const match of source.matchAll(
    /export\s+(?:default\s+)?async\s+function\s+(\w+)\s*\([\s\S]*?\n\}/g
  )) {
    if (/\buseTranslations\(/.test(match[0])) {
      failures.push(
        `${relative(file)}: async function ${match[1]} calls useTranslations. Async components must use getTranslations.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4. A static translator's namespace argument is ignored at runtime, so only a
//    check keeps it honest against the catalog file the caller imports.
// ---------------------------------------------------------------------------

for (const file of sourceFiles) {
  const source = readSource(file);
  for (const match of source.matchAll(
    /createDefaultTranslator\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)/g
  )) {
    const [, namespace, binding] = match;
    const importPattern = new RegExp(
      `import\\s+${binding}\\s+from\\s+"@/i18n/generated/default-en/([^"]+)\\.json"`
    );
    const imported = source.match(importPattern)?.[1];
    if (imported !== namespace) {
      failures.push(
        `${relative(file)}: createDefaultTranslator("${namespace}", ${binding}) but ${binding} is ${
          imported ? `default-en/${imported}.json` : "not imported from default-en"
        }.`
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(
  `Intl wiring valid: ${rootNamespaces.size} root client namespaces, ${
    findPages(APP).length
  } pages checked.`
);
