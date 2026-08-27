import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve("src");
const OUTPUT = path.resolve("../../artifacts/copy-audit/ui-copy-inventory.md");
const EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_PARTS = ["/generated/", "/contracts/plutus.json"];
const SKIP_SUFFIXES = [".test.ts", ".test.tsx", ".d.ts"];
const EXCLUDED_ATTRIBUTES = new Set([
  "className",
  "id",
  "key",
  "href",
  "src",
  "type",
  "role",
  "variant",
  "size",
  "value",
  "name",
  "htmlFor",
  "data-testid"
]);
const EXCLUDED_PROPERTIES = new Set([
  "className",
  "id",
  "key",
  "href",
  "src",
  "type",
  "role",
  "variant",
  "size",
  "value",
  "kind",
  "action",
  "intent",
  "status",
  "tone",
  "icon",
  "unit",
  "txHash",
  "policyId",
  "assetName",
  "builder"
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    const normalized = fullPath.split(path.sep).join("/");
    if (!EXTENSIONS.has(path.extname(entry.name))) return [];
    if (SKIP_PARTS.some((part) => normalized.includes(part))) return [];
    if (SKIP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) return [];
    return [fullPath];
  });
}

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeCopy(value) {
  if (!value || value.length < 2) return false;
  if (/^(?:https?:|\/|\.\/|@\/|#[0-9a-f]{3,8}$)/i.test(value)) return false;
  if (/^[a-f0-9]{24,}$/i.test(value)) return false;
  if (/^[a-z0-9]+(?:[-_.:/][a-z0-9]+)+$/.test(value)) return false;
  if (/^(?:flex|grid|block|hidden|relative|absolute|fixed|sticky|inline|space-|gap-|p-|m-|w-|h-|min-|max-|text-|bg-|border-|rounded-|shadow-|hover:|focus:)/.test(value)) return false;
  return /[A-Za-z]/.test(value);
}

function propertyName(node) {
  if (!node) return "";
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return "";
}

function staticText(node, source) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.getText(source).slice(1, -1);
  return null;
}

const rows = [];
for (const file of walk(ROOT)) {
  const sourceText = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  function add(node, text, context) {
    const value = clean(text);
    if (!looksLikeCopy(value)) return;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    rows.push({
      file: path.relative(path.resolve("../.."), file).split(path.sep).join("/"),
      line: position.line + 1,
      context,
      text: value
    });
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      add(node, node.getText(source), "jsx");
    } else if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      !EXCLUDED_ATTRIBUTES.has(node.name.getText(source))
    ) {
      add(node, node.initializer.text, `attr:${node.name.getText(source)}`);
    } else if (
      ts.isPropertyAssignment(node) &&
      ts.isStringLiteralLike(node.initializer) &&
      !EXCLUDED_PROPERTIES.has(propertyName(node.name))
    ) {
      add(node, node.initializer.text, `property:${propertyName(node.name) || "unknown"}`);
    } else if (ts.isReturnStatement(node) && node.expression && ts.isStringLiteralLike(node.expression)) {
      add(node, node.expression.text, "return");
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (ts.isStringLiteralLike(node.initializer) || ts.isTemplateExpression(node.initializer))
    ) {
      add(node.initializer, staticText(node.initializer, source), `variable:${node.name.getText(source)}`);
    } else if (
      ts.isParameter(node) &&
      node.initializer &&
      (ts.isStringLiteralLike(node.initializer) || ts.isTemplateExpression(node.initializer))
    ) {
      add(node.initializer, staticText(node.initializer, source), `default:${node.name.getText(source)}`);
    } else if (
      ts.isArrowFunction(node) &&
      (ts.isStringLiteralLike(node.body) || ts.isTemplateExpression(node.body))
    ) {
      add(node.body, staticText(node.body, source), "arrow-return");
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        const text = staticText(element, source);
        if (text !== null) add(element, text, "array");
      }
    } else if (
      ts.isThrowStatement(node) &&
      node.expression &&
      ts.isNewExpression(node.expression) &&
      node.expression.expression.getText(source) === "Error"
    ) {
      for (const argument of node.expression.arguments ?? []) {
        const text = staticText(argument, source);
        if (text !== null) add(argument, text, "throw:Error");
      }
    } else if (ts.isConditionalExpression(node)) {
      if (ts.isStringLiteralLike(node.whenTrue)) add(node.whenTrue, node.whenTrue.text, "conditional");
      if (ts.isStringLiteralLike(node.whenFalse)) add(node.whenFalse, node.whenFalse.text, "conditional");
    } else if (ts.isCallExpression(node)) {
      const callName = node.expression.getText(source);
      if (/^(?:alert|confirm|prompt)$|pushFieldError|getUserFacingErrorMessage|extractErrorMessage|toast\.|set[A-Za-z]+Error|showToast/.test(callName)) {
        for (const argument of node.arguments) {
          const text = staticText(argument, source);
          if (text !== null) add(argument, text, `call:${callName}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.text.localeCompare(b.text));
const unique = rows.filter(
  (row, index) =>
    index === 0 ||
    row.file !== rows[index - 1].file ||
    row.line !== rows[index - 1].line ||
    row.text !== rows[index - 1].text
);

const lines = [
  "# UI copy inventory",
  "",
  `Generated candidates: ${unique.length}`,
  "",
  "This inventory is a coverage aid. Each line still needs a manual context review.",
  ""
];
let currentFile = "";
for (const row of unique) {
  if (row.file !== currentFile) {
    currentFile = row.file;
    lines.push(`## ${currentFile}`, "");
  }
  lines.push(`- L${row.line} · ${row.context} · ${row.text}`);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${lines.join("\n")}\n`);
console.log(`${unique.length} candidates written to ${OUTPUT}`);
