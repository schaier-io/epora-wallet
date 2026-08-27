import fs from "node:fs";
import path from "node:path";
import { readMessageCatalog } from "./lib/message-catalog.mjs";

const ROOT = path.resolve("src");
const messages = readMessageCatalog("en");
const FIX = process.argv.includes("--fix");
const internalValue = /(?:^|\s)(?:!?h-|!?w-|min-h-|min-w-|max-h-|max-w-|bg-|text-|border-|opacity-|animate-|from-|to-|hover:|focus:|status-dot|rounded-|font-|xl:|2xl:|shadow-)|^(?:true|false|undefined|lovelace|stt)$|^(?:blur|translate|scale|rotate|hsl|var)\(|^(?:opacity|transform|filter)(?:,\s*(?:opacity|transform|filter))*$/;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

const findings = [];
const sourceFiles = walk(ROOT);
for (const file of sourceFiles) {
  let source = fs.readFileSync(file, "utf8");
  const namespace = source.match(/(?:useTranslations|createDefaultTranslator)\("([^"]+)"(?:,|\))/)?.[1];
  if (!namespace || !messages[namespace]) continue;
  for (const match of source.matchAll(/i18n\("([^"]+)"/g)) {
    const value = messages[namespace][match[1]];
    const line = source.slice(0, match.index).split("\n").length;
    const lineText = source.split("\n")[line - 1] ?? "";
    const structuralUse =
      /(?:===|!==)\s*i18n\(/.test(lineText) ||
      /\b(?:className|key|variant|size|type|role|status|tone|value)\s*=\s*\{[^}\n]*i18n\(/.test(
        lineText
      ) ||
      /\bcn\([^\n]*i18n\(/.test(lineText);
    if (structuralUse || (typeof value === "string" && internalValue.test(value))) {
      findings.push(`${path.relative(process.cwd(), file)}:${line} · ${match[1]} = ${value}`);
      if (FIX && typeof value === "string") {
        source = source.replaceAll(`i18n("${match[1]}")`, JSON.stringify(value));
      }
    }
  }
  if (FIX) fs.writeFileSync(file, source);
}

const rawUserErrorPatterns = [
  /\berrors\.push\(\s*["`]/g,
  /\bjsonError\(\s*["`]/g,
  /\bset[A-Za-z]*Error\(\s*(?:err|error|caught)\.(?:message|stack)\b/g,
  /\berror\s*:\s*(?:err|error|caught)\s+instanceof\s+Error\s*\?\s*(?:err|error|caught)\.message\b/g,
  /\b(?:alert|confirm|prompt)\(\s*["`][A-Za-z]/g,
  /\bnew\s+Notification\(\s*["`][A-Za-z]/g,
  /\b(?:textContent|innerText|outerText|document\.title)\s*=\s*["`][A-Za-z]/g,
  /\.setAttribute\(\s*["`](?:aria-label|aria-description|aria-valuetext|alt|placeholder|title)["`]\s*,\s*["`][A-Za-z]/g,
  /\.(?:fillText|strokeText)\(\s*["`][A-Za-z]/g,
  /\b(?:React\.)?createElement\(\s*["`][A-Za-z][^"`]*["`]\s*,[^,\n]*,\s*["`][A-Za-z]/g
];

for (const file of sourceFiles) {
  const relative = path.relative(process.cwd(), file);
  if (!/^(?:src\/(?:app|components|hooks|providers|lib\/contracts)\/)/.test(relative)) {
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  for (const pattern of rawUserErrorPatterns) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      findings.push(`${relative}:${line} · raw user-facing error text bypasses i18n`);
    }
  }
}

function walkByExtension(directory, extensions) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkByExtension(fullPath, extensions);
    return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

for (const file of walkByExtension(ROOT, new Set([".css", ".scss", ".sass", ".less"]))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bcontent\s*:\s*(["'])(.*?)\1/g)) {
    if (!/[A-Za-z]/.test(match[2])) continue;
    const line = source.slice(0, match.index).split("\n").length;
    findings.push(`${path.relative(process.cwd(), file)}:${line} · CSS-generated text bypasses i18n`);
  }
}

const staticMarkupRoots = [ROOT, path.resolve("public")];
for (const staticRoot of staticMarkupRoots) {
  for (const file of walkByExtension(staticRoot, new Set([".html", ".svg", ".xml"]))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/<(?:desc|text|title)\b[^>]*>\s*([^<]*[A-Za-z][^<]*)</gi)) {
      const line = source.slice(0, match.index).split("\n").length;
      findings.push(`${path.relative(process.cwd(), file)}:${line} · static visible text bypasses i18n`);
    }
  }
}

if (findings.length) {
  console.error(findings.join("\n"));
  if (!FIX) process.exitCode = 1;
} else {
  console.log("No internal sentinels, raw user-facing errors, or static visible text bypass i18n.");
}
