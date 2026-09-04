import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { readMessageCatalog, writeMessageCatalog } from "./lib/message-catalog.mjs";

const ROOT = path.resolve("src");
const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");
const TRANSLATED_PROPERTIES = new Set([
  "actionLabel",
  "ariaLabel",
  "body",
  "buttonText",
  "caption",
  "content",
  "cta",
  "description",
  "detail",
  "emptyHint",
  "emptyText",
  "error",
  "eyebrow",
  "feedback",
  "heading",
  "helper",
  "hint",
  "instructions",
  "label",
  "legend",
  "message",
  "nextStep",
  "note",
  "outcome",
  "placeholder",
  "prompt",
  "screenReaderText",
  "subtitle",
  "success",
  "summary",
  "title",
  "warning",
  "whatChanges"
]);
const EXCLUDED_PROPERTIES = new Set([
  "action",
  "actionKind",
  "audience",
  "builder",
  "className",
  "flowStep",
  "group",
  "href",
  "icon",
  "id",
  "intent",
  "key",
  "kind",
  "lane",
  "method",
  "mode",
  "name",
  "prerequisites",
  "risk",
  "routeKey",
  "status",
  "sameSite",
  "tone",
  "type",
  "unit",
  "value"
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ["generated", "__tests__"].includes(entry.name) ? [] : walk(fullPath);
    }
    if (!/\.ts$/.test(entry.name) || /(?:\.test|\.d)\.ts$/.test(entry.name)) return [];
    const relative = path.relative(ROOT, fullPath).split(path.sep).join("/");
    // The public v1 API's strings are a contract, not UI copy. The OpenAPI
    // document publishes them verbatim, `openapi:check` pins them, and the API
    // does no locale negotiation, so translating them would make the served
    // spec disagree with what a non-default deployment answers.
    const isPublicApiContract =
      relative.startsWith("app/api/v1/") ||
      relative.startsWith("lib/api/") ||
      relative === "lib/http/tx-route.ts";
    if (isPublicApiContract) return [];
    const inStaticCopyScope =
      relative.startsWith("app/api/") ||
      relative === "app/manifest.ts" ||
      relative.startsWith("components/user/") ||
      relative === "lib/contracts/state-validation.ts" ||
      relative.startsWith("lib/mesh/transactions/") ||
      relative.startsWith("lib/http/") ||
      relative.startsWith("lib/proposals/") ||
      relative.startsWith("lib/user-flow/") ||
      relative.startsWith("lib/utils/") ||
      relative.startsWith("lib/wallet/") ||
      relative.startsWith("lib/walletconnect/") ||
      relative === "lib/copy.ts";
    return inStaticCopyScope ? [relative] : [];
  });
}

const TARGETS = walk(ROOT);

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

function looksLikeCopy(value) {
  if (!value || value.length < 2 || !/[A-Za-z]/.test(value)) return false;
  if (/^(?:https?:|\/|\.\/|@\/|#[0-9a-f]{3,8}$)/i.test(value)) return false;
  if (/^[a-f0-9]{24,}$/i.test(value)) return false;
  if (/^[a-z0-9]+(?:[-_.:/][a-z0-9]+)+$/.test(value)) return false;
  return true;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return "";
}

function namespaceFor(relative) {
  return relative
    .replace(/\.[^.]+$/, "")
    .split("/")
    .map((part) =>
      part
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join("")
    )
    .join("");
}

function keyFor(value, namespaceMessages) {
  const words = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  let key = words
    .map((word, index) => {
      const normalized = word.toLowerCase();
      return index === 0 ? normalized : normalized[0].toUpperCase() + normalized.slice(1);
    })
    .join("");
  if (!key || /^\d/.test(key)) key = `message${key ? `_${key}` : ""}`;
  if (namespaceMessages[key] && namespaceMessages[key] !== value) {
    key = `${key}_${crypto.createHash("sha1").update(value).digest("hex").slice(0, 6)}`;
  }
  return key;
}

function translatedProperty(node) {
  let current = node.parent;
  while (
    current &&
    (ts.isArrayLiteralExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isConditionalExpression(current) ||
      ts.isBinaryExpression(current))
  ) {
    current = current.parent;
  }
  const name = ts.isPropertyAssignment(current) ? propertyName(current.name) : "";
  return (
    ts.isPropertyAssignment(current) &&
    current.name !== node &&
    TRANSLATED_PROPERTIES.has(name) &&
    !EXCLUDED_PROPERTIES.has(name)
  );
}

function translatedCall(node) {
  const parent = node.parent;
  if (!ts.isCallExpression(parent)) return false;
  if (/createTxPreview$/.test(parent.expression.getText())) {
    return parent.arguments[1] === node;
  }
  return /(?:pushFieldError|getUserFacingErrorMessage|extractErrorMessage|set[A-Za-z]+Error|showToast|warnings\.push|\.regex|\.refine|\.min)/.test(
    parent.expression.getText()
  );
}

function translatedTransactionSurface(node) {
  const parent = node.parent;
  if (!ts.isCallExpression(parent)) return false;
  const callName = parent.expression.getText();
  if (/createTxPreview$/.test(callName)) return parent.arguments[1] === node;
  return /warnings\.push$/.test(callName);
}

function translatedVariable(node) {
  let current = node.parent;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isConditionalExpression(current) ||
      ts.isBinaryExpression(current) ||
      ts.isTemplateExpression(current))
  ) {
    current = current.parent;
  }

  return (
    ts.isVariableDeclaration(current) &&
    ts.isIdentifier(current.name) &&
    (current.name.text === "message" ||
      /(?:Hint|Error|Label|Message|Summary|Title|Description)$/.test(current.name.text))
  );
}

function isRuntimeSentinel(node) {
  let current = node;
  while (current.parent && ts.isParenthesizedExpression(current.parent)) {
    current = current.parent;
  }

  const parent = current.parent;
  if (ts.isTypeOfExpression(parent)) return true;
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.InKeyword) {
    return true;
  }
  if (!ts.isBinaryExpression(parent)) return false;

  return [
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken
  ].includes(parent.operatorToken.kind);
}

function templateMessage(node) {
  const values = {};
  let message = node.head.text;
  node.templateSpans.forEach((span, index) => {
    const expression = span.expression.getText();
    const baseName = ts.isIdentifier(span.expression) ? span.expression.text : `value${index + 1}`;
    let name = baseName;
    let suffix = 2;
    while (Object.hasOwn(values, name)) name = `${baseName}${suffix++}`;
    values[name] = expression;
    message += `{${name}}${span.literal.text}`;
  });
  return { message: clean(message), values };
}

function applyReplacements(sourceText, replacements) {
  return replacements
    .toSorted((a, b) => b.start - a.start)
    .reduce(
      (text, replacement) =>
        `${text.slice(0, replacement.start)}${replacement.text}${text.slice(replacement.end)}`,
      sourceText
    );
}

const messages = readMessageCatalog("en");
let filesChanged = 0;
let messagesAdded = 0;
const filesToMigrate = [];
const candidates = [];

for (const relative of TARGETS) {
  const file = path.join(ROOT, relative);
  const sourceText = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const namespace = namespaceFor(relative);
  const transactionPreviewScope = relative.startsWith("lib/mesh/transactions/");
  const namespaceMessages = { ...(messages[namespace] ?? {}) };
  const replacements = [];

  function addExpression(node, value, values = {}) {
    if (isRuntimeSentinel(node)) return;
    const normalized = clean(value);
    if (!looksLikeCopy(normalized)) return;
    if (CHECK) candidates.push(`${relative}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} · ${normalized}`);
    const key = keyFor(normalized, namespaceMessages);
    if (!namespaceMessages[key]) {
      namespaceMessages[key] = normalized;
      messagesAdded += 1;
    }
    const entries = Object.entries(values);
    const valueArgument = entries.length
      ? `, { ${entries.map(([name, expression]) => `${name}: ${expression}`).join(", ")} }`
      : "";
    replacements.push({
      start: node.getStart(source),
      end: node.getEnd(),
      text: `i18n("${key}"${valueArgument})`
    });
  }

  function visit(node) {
    const isLiteral =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node);
    const translatedContext =
      isLiteral &&
      (transactionPreviewScope
        ? translatedTransactionSurface(node)
        : translatedProperty(node) || translatedCall(node) || translatedVariable(node));
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      translatedContext
    ) {
      addExpression(node, node.text);
    } else if (
      ts.isTemplateExpression(node) &&
      translatedContext
    ) {
      const template = templateMessage(node);
      addExpression(node, template.message, template.values);
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  if (replacements.length === 0) continue;
  filesToMigrate.push(relative);

  if (
    !sourceText.includes("createDefaultTranslator(") &&
    !sourceText.includes("useTranslations(")
  ) {
    const imports = source.statements.filter(ts.isImportDeclaration);
    const insertAt = imports.at(-1)?.getEnd() ?? 0;
    replacements.push({
      start: insertAt,
      end: insertAt,
      text: `\nimport { createDefaultTranslator } from "@/i18n/default-translator";\n\nconst i18n = createDefaultTranslator("${namespace}");`
    });
  }

  if (WRITE) fs.writeFileSync(file, applyReplacements(sourceText, replacements));
  messages[namespace] = namespaceMessages;
  filesChanged += 1;
}

if (WRITE) {
  const orderedMessages = Object.fromEntries(
    Object.entries(messages)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([namespace, namespaceMessages]) => [
        namespace,
        Object.fromEntries(Object.entries(namespaceMessages).toSorted(([left], [right]) => left.localeCompare(right)))
      ])
  );
  writeMessageCatalog("en", orderedMessages);
}

console.log(`${WRITE ? "Migrated" : "Would migrate"} ${messagesAdded} static messages across ${filesChanged} files.`);
if (CHECK && filesToMigrate.length > 0) console.error(filesToMigrate.join("\n"));
if (CHECK && candidates.length > 0) console.error(candidates.join("\n"));
if (CHECK && filesChanged > 0) process.exitCode = 1;
