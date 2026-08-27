import fs from "node:fs";
import path from "node:path";
import { parse } from "@formatjs/icu-messageformat-parser";

const locales = fs
  .readdirSync(path.resolve("messages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();
const configSource = fs.readFileSync(path.resolve("src/i18n/config.ts"), "utf8");
const configuredLocales = JSON.parse(
  `[${configSource.match(/export const locales = \[([^\]]*)\]/)?.[1] ?? ""}]`
).toSorted();

let failed = false;
let namespaceCount = 0;
let messageCount = 0;
const keySets = new Map();

if (JSON.stringify(locales) !== JSON.stringify(configuredLocales)) {
  console.error(
    `Locale folders (${locales.join(", ")}) do not match configured locales (${configuredLocales.join(", ")}).`
  );
  failed = true;
}

for (const locale of locales) {
  const directory = path.resolve(`messages/${locale}`);
  const namespaceFiles = new Map();
  const localeKeys = new Set();

  for (const fileName of fs.readdirSync(directory).filter((name) => name.endsWith(".json"))) {
    const file = path.join(directory, fileName);
    const lineCount = fs.readFileSync(file, "utf8").split("\n").length - 1;
    if (lineCount > 650) {
      console.error(`${fileName}: ${lineCount} lines exceeds the 650-line catalog shard limit.`);
      failed = true;
    }

    const shard = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [namespace, entries] of Object.entries(shard)) {
      if (namespaceFiles.has(namespace)) {
        console.error(`${namespace}: duplicated in ${namespaceFiles.get(namespace)} and ${fileName}.`);
        failed = true;
      }
      namespaceFiles.set(namespace, fileName);
      namespaceCount += 1;

      if (!entries || Array.isArray(entries) || typeof entries !== "object") {
        console.error(`${namespace}: namespace must contain a message object.`);
        failed = true;
        continue;
      }

      for (const [key, value] of Object.entries(entries)) {
        messageCount += 1;
        localeKeys.add(`${namespace}.${key}`);
        if (typeof value !== "string" || value.length === 0) {
          console.error(`${namespace}.${key}: message must be a non-empty string.`);
          failed = true;
        } else {
          try {
            parse(value);
          } catch (error) {
            console.error(`${namespace}.${key}: invalid ICU message (${error.message}).`);
            failed = true;
          }
        }
      }
    }
  }
  keySets.set(locale, localeKeys);
}

const referenceLocale = configuredLocales[0];
const referenceKeys = referenceLocale ? keySets.get(referenceLocale) : undefined;
if (referenceKeys) {
  for (const locale of configuredLocales.slice(1)) {
    const localeKeys = keySets.get(locale) ?? new Set();
    for (const key of referenceKeys) {
      if (!localeKeys.has(key)) {
        console.error(`${locale}: missing ${key}.`);
        failed = true;
      }
    }
    for (const key of localeKeys) {
      if (!referenceKeys.has(key)) {
        console.error(`${locale}: extra ${key}.`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Catalog valid: ${messageCount} messages across ${namespaceCount} namespaces.`);
}
