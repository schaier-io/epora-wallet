import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { readMessageCatalog, writeMessageCatalog } from "./lib/message-catalog.mjs";

const ROOT = path.resolve("src");
const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");
const INCLUDED_ROOTS = ["app", "components", "hooks", "lib", "providers"];
const TRANSLATED_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-valuetext",
  "placeholder",
  "title"
]);
const TRANSLATED_PROPERTIES = new Set([
  "actionLabel",
  "ariaLabel",
  "body",
  "buttonText",
  "caption",
  "content",
  "copiedLabel",
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
const TRANSLATED_VARIABLE = /(?:actionLabel|ariaLabel|body|buttonText|caption|content|copy|cta|description|detail|empty|error|eyebrow|feedback|heading|helper|hint|instructions|label|legend|message|nextStep|note|outcome|placeholder|prompt|screenReaderText|statusText|subtitle|success|summary|title|tooltip|warning|whatChanges)$/i;
const SKIP_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".d.ts"];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) return [];
    if (SKIP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) return [];
    const relative = path.relative(ROOT, fullPath);
    return INCLUDED_ROOTS.some((root) => relative.startsWith(`${root}${path.sep}`))
      ? [fullPath]
      : [];
  });
}

function decodeJsxText(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function clean(value) {
  return decodeJsxText(value).replace(/\s+/g, " ").trim();
}

function looksLikeCopy(value) {
  if (!value || value.length < 2 || !/[A-Za-z]/.test(value)) return false;
  if (/^(?:https?:|\/|\.\/|@\/|#[0-9a-f]{3,8}$)/i.test(value)) return false;
  if (/^[a-f0-9]{24,}$/i.test(value)) return false;
  if (/^[a-z0-9]+(?:[-_.:/][a-z0-9]+)+$/.test(value)) return false;
  return true;
}

function namespaceFor(file) {
  return path
    .relative(ROOT, file)
    .replace(/\.[^.]+$/, "")
    .split(path.sep)
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

function componentNameForFunction(node) {
  if (ts.isFunctionDeclaration(node)) return node.name?.text ?? "";
  const parent = node.parent;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : "";
}

function findComponentFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isArrowFunction(current) ||
        ts.isFunctionExpression(current)) &&
      ts.isBlock(current.body)
    ) {
      const name = componentNameForFunction(current);
      if (/^(?:[A-Z]|use[A-Z])/.test(name) && !current.modifiers?.some((item) => item.kind === ts.SyntaxKind.AsyncKeyword)) {
        return current;
      }
    }
    current = current.parent;
  }
  return null;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return "";
}

function isTranslatedPropertyName(name) {
  return TRANSLATED_PROPERTIES.has(name) || /(?:Copy|Label|Message|Text)$/.test(name);
}

function isUserFacingContainer(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isConditionalExpression(parent) ||
      ts.isBinaryExpression(parent) ||
      ts.isParenthesizedExpression(parent)
    ) {
      current = parent;
      continue;
    }
    if (ts.isReturnStatement(parent)) return true;
    if (ts.isPropertyAssignment(parent)) {
      return isTranslatedPropertyName(propertyName(parent.name));
    }
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return TRANSLATED_VARIABLE.test(parent.name.text);
    }
    if (ts.isJsxExpression(parent)) {
      return ts.isJsxAttribute(parent.parent)
        ? TRANSLATED_ATTRIBUTES.has(parent.parent.name.getText()) ||
            isTranslatedPropertyName(parent.parent.name.getText())
        : true;
    }
    if (ts.isCallExpression(parent)) {
      const callName = parent.expression.getText();
      if (/pushBadge/.test(callName)) return parent.arguments[0] === current;
      if (/copyTextToClipboard/.test(callName)) return parent.arguments[1] === current;
      return /^(?:alert|confirm|prompt)$|(?:toast|showToast|set[A-Za-z]*(?:Error|Info|Message|Feedback)|pushFieldError|getUserFacingErrorMessage)/.test(callName);
    }
    return false;
  }
  return false;
}

function isTranslatedContext(node) {
  const parent = node.parent;
  if (
    ts.isConditionalExpression(parent) &&
    (parent.whenTrue === node || parent.whenFalse === node) &&
    isUserFacingContainer(parent)
  ) {
    return true;
  }
  if (
    ts.isBinaryExpression(parent) &&
    [ts.SyntaxKind.PlusToken, ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind) &&
    isUserFacingContainer(parent)
  ) {
    return true;
  }
  if (ts.isReturnStatement(parent)) return true;
  if (ts.isPropertyAssignment(parent) && isTranslatedPropertyName(propertyName(parent.name))) {
    return true;
  }
  if (
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name) &&
    TRANSLATED_VARIABLE.test(parent.name.text)
  ) {
    return true;
  }
  if (ts.isJsxExpression(parent)) return isUserFacingContainer(node);
  if (ts.isCallExpression(parent)) {
    const callName = parent.expression.getText();
    if (/pushBadge/.test(callName)) return parent.arguments[0] === node;
    if (/copyTextToClipboard/.test(callName)) return parent.arguments[1] === node;
    return /^(?:alert|confirm|prompt)$|(?:toast|showToast|set[A-Za-z]*(?:Error|Info|Message|Feedback)|pushFieldError|getUserFacingErrorMessage)/.test(callName);
  }
  return false;
}

function isTranslatedPropDefault(node) {
  const parent = node.parent;
  return (
    ts.isBindingElement(parent) &&
    parent.initializer === node &&
    ts.isIdentifier(parent.name) &&
    isTranslatedPropertyName(parent.name.text)
  );
}

function templateMessage(node) {
  const values = {};
  let message = node.head.text;
  node.templateSpans.forEach((span, index) => {
    const expression = span.expression.getText();
    const baseName = ts.isIdentifier(span.expression) ? span.expression.text : `value${index + 1}`;
    let name = baseName;
    let suffix = 2;
    while (Object.hasOwn(values, name)) {
      name = `${baseName}${suffix}`;
      suffix += 1;
    }
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
let skipped = 0;
const skippedRows = [];
const unsafeDefaultRows = [];
const filesToMigrate = [];

for (const file of walk(ROOT)) {
  const sourceText = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const namespace = namespaceFor(file);
  const namespaceMessages = { ...(messages[namespace] ?? {}) };
  const replacements = [];
  const componentFunctions = new Set();

  function add(node, rawValue, replacementFactory) {
    const value = clean(rawValue);
    if (!looksLikeCopy(value)) return;
    const component = findComponentFunction(node);
    if (!component) {
      skipped += 1;
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      skippedRows.push(`${path.relative(process.cwd(), file)}:${line} · ${value}`);
      return;
    }
    const key = keyFor(value, namespaceMessages);
    if (!namespaceMessages[key]) {
      namespaceMessages[key] = value;
      messagesAdded += 1;
    }
    componentFunctions.add(component);
    replacements.push(replacementFactory(key));
  }

  function addExpression(node, value, values = {}) {
    add(node, value, (key) => {
      const entries = Object.entries(values);
      const valueArgument = entries.length
        ? `, { ${entries.map(([name, expression]) => `${name}: ${expression}`).join(", ")} }`
        : "";
      return {
        start: node.getStart(source),
        end: node.getEnd(),
        text: `i18n("${key}"${valueArgument})`
      };
    });
  }

  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      isTranslatedPropDefault(node) &&
      looksLikeCopy(clean(node.text))
    ) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      unsafeDefaultRows.push(`${path.relative(process.cwd(), file)}:${line} · ${clean(node.text)}`);
    } else if (ts.isJsxText(node)) {
      const raw = node.getText(source);
      add(node, raw, (key) => {
        const leading = raw.match(/^\s*/)?.[0] ?? "";
        const trailing = raw.match(/\s*$/)?.[0] ?? "";
        return {
          start: node.getStart(source),
          end: node.getEnd(),
          text: `${leading}{i18n("${key}")}${trailing}`
        };
      });
    } else if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      (TRANSLATED_ATTRIBUTES.has(node.name.getText(source)) ||
        isTranslatedPropertyName(node.name.getText(source)))
    ) {
      add(node, node.initializer.text, (key) => ({
        start: node.initializer.getStart(source),
        end: node.initializer.getEnd(),
        text: `{i18n("${key}")}`
      }));
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !ts.isJsxAttribute(node.parent) &&
      isTranslatedContext(node)
    ) {
      addExpression(node, node.text);
    } else if (ts.isTemplateExpression(node) && isTranslatedContext(node)) {
      const template = templateMessage(node);
      addExpression(node, template.message, template.values);
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  if (replacements.length === 0) continue;
  filesToMigrate.push(path.relative(process.cwd(), file));

  for (const component of componentFunctions) {
    if (component.body.getText(source).includes("useTranslations(")) continue;
    replacements.push({
      start: component.body.getStart(source) + 1,
      end: component.body.getStart(source) + 1,
      text: `\n  const i18n = useTranslations("${namespace}");`
    });
  }

  if (!sourceText.includes('from "next-intl"') && !sourceText.includes("from 'next-intl'")) {
    const directive = source.statements.find((statement) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression));
    const importPosition = directive ? directive.getEnd() : 0;
    replacements.push({
      start: importPosition,
      end: importPosition,
      text: `${importPosition ? "\n" : ""}import { useTranslations } from "next-intl";\n`
    });
  }

  const nextSource = applyReplacements(sourceText, replacements);
  if (WRITE) fs.writeFileSync(file, nextSource);
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

console.log(`${WRITE ? "Migrated" : "Would migrate"} ${messagesAdded} messages across ${filesChanged} files; skipped ${skipped} candidates.`);
if (process.argv.includes("--report-skipped")) console.log(skippedRows.join("\n"));
if (CHECK && filesToMigrate.length > 0) {
  console.error(`Files with untranslated copy:\n${filesToMigrate.join("\n")}`);
}
if (unsafeDefaultRows.length > 0) {
  console.error(`Hardcoded translatable prop defaults:\n${unsafeDefaultRows.join("\n")}`);
}
if (CHECK && (filesChanged > 0 || unsafeDefaultRows.length > 0)) process.exitCode = 1;
