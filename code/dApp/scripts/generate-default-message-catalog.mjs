import fs from "node:fs";
import path from "node:path";
import { readMessageCatalog } from "./lib/message-catalog.mjs";

const sourceRoot = path.resolve("src");
const outputDirectory = path.resolve("src/i18n/generated");
const check = process.argv.includes("--check");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(file);
    return /\.tsx?$/.test(entry.name) && !/(?:\.test|\.d)\.tsx?$/.test(entry.name)
      ? [file]
      : [];
  });
}

const namespaceNames = new Set();
for (const file of walk(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/createDefaultTranslator\("([^"]+)"/g)) {
    namespaceNames.add(match[1]);
  }
}

const configSource = fs.readFileSync(path.resolve("src/i18n/config.ts"), "utf8");
const configuredLocales = JSON.parse(
  `[${configSource.match(/export const locales = \[([^\]]*)\]/)?.[1] ?? ""}]`
);
if (configuredLocales.length > 1 && namespaceNames.size > 0) {
  throw new Error(
    "Default-locale translators remain in pure domain modules. Inject request/client translators before enabling another locale."
  );
}

const catalog = readMessageCatalog("en");
const expectedFiles = new Map();
for (const namespace of [...namespaceNames].toSorted()) {
  const entries = catalog[namespace];
  if (!entries) throw new Error(`Missing default namespace: ${namespace}`);
  expectedFiles.set(`default-en/${namespace}.json`, `${JSON.stringify(entries, null, 2)}\n`);
}

const differences = [];
for (const [name, expected] of expectedFiles) {
  const file = path.join(outputDirectory, name);
  const actual = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (actual !== expected) differences.push(name);
}
if (fs.existsSync(outputDirectory)) {
  const generatedFiles = fs.readdirSync(outputDirectory, { recursive: true })
    .map((name) => String(name))
    .filter((name) => path.basename(name).startsWith("default-en") || name.startsWith("default-en/"));
  for (const name of generatedFiles) {
    const file = path.join(outputDirectory, name);
    if (fs.statSync(file).isFile() && !expectedFiles.has(name)) differences.push(name);
  }
}

if (check) {
  if (differences.length > 0) {
    console.error(`Generated default catalog is stale: ${[...new Set(differences)].join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Default catalog valid: ${namespaceNames.size} isolated namespaces.`);
  }
} else {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.rmSync(path.join(outputDirectory, "default-en"), { recursive: true, force: true });
  for (const name of fs.readdirSync(outputDirectory)) {
    if (name.startsWith("default-en") && !expectedFiles.has(name)) {
      fs.rmSync(path.join(outputDirectory, name), { recursive: true, force: true });
    }
  }
  for (const [name, contents] of expectedFiles) {
    const file = path.join(outputDirectory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  console.log(`Generated ${namespaceNames.size} isolated default namespaces.`);
}
