import fs from "node:fs";
import path from "node:path";
import { readMessageCatalog, writeMessageCatalog } from "./lib/message-catalog.mjs";

const root = path.resolve("src");
const messages = readMessageCatalog("en");
const used = new Map();
const internalValue = /(?:^|\s)(?:!?h-|!?w-|min-h-|min-w-|max-h-|max-w-|bg-|text-|border-|opacity-|animate-|from-|to-|hover:|focus:|rounded-|font-|xl:|2xl:|shadow-)|^(?:true|false|undefined|production|number|alert|status|img|presentation|separator|admin|multisig|beneficiary|lovelace|stt|Retry-After|outline|primary|secondary|warning|destructive|success|info|custom|decimal|numeric|specific|some|none|default|good|warn|done|error|idle|connected|waiting|landing|refreshing|submitting|delayed|confirmed|mint|use|configure|overview|review|block|streamingPayments|OPEN|SUBMITTED|CANCELLED|ACTIVE|CLOSED|FORWARD|MINT|CLOSE|UNKNOWN)$|(?:^|\s)(?:blur|translate|scale|rotate)\(|^(?:url|var|hsl)\(/;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : /\.[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

for (const file of walk(root)) {
  const source = fs.readFileSync(file, "utf8");
  const namespaces = [...source.matchAll(/(?:useTranslations|createDefaultTranslator)\("([^"]+)"(?:,|\))/g)].map(
    (match) => match[1]
  );
  const keys = [...source.matchAll(/i18n\("([^"]+)"/g)].map((match) => match[1]);
  for (const namespace of namespaces) {
    const namespaceKeys = used.get(namespace) ?? new Set();
    keys.forEach((key) => namespaceKeys.add(key));
    used.set(namespace, namespaceKeys);
  }
}

let removed = 0;
for (const [namespace, entries] of Object.entries(messages)) {
  for (const [key, value] of Object.entries(entries)) {
    if (internalValue.test(value) && !used.get(namespace)?.has(key)) {
      delete entries[key];
      removed += 1;
    }
  }
  if (Object.keys(entries).length === 0) delete messages[namespace];
}

writeMessageCatalog("en", messages);
console.log(`Removed ${removed} unused internal messages.`);
