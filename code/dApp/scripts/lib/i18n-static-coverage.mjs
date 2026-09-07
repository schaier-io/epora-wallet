import ts from "typescript";

const USER_FACING_PROPERTIES = new Set([
  "addedDetail",
  "amountSummary",
  "changedDetail",
  "emptyValue",
  "fallbackMessage",
  "pathLabels",
  "question",
  "reason",
  "receiptSummary",
  "removedDetail",
  "routeExplanation",
  "shortLabel",
  "startingPoint",
  "surfaceLabel",
  "whenToUse"
]);

const USER_FACING_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-valuetext",
  "placeholder",
  "title"
]);

const USER_FACING_VARIABLE = /(?:copy|description|detail|empty|error|fallback|heading|helper|hint|instructions|label|message|note|prompt|question|reason|summary|text|title|warning)$/i;
const USER_FACING_FUNCTION = /^(?:describe|format)|^(?:build|create|get|resolve).*(?:copy|description|detail|error|heading|helper|hint|label|message|prompt|question|reason|receipt|summary|text|title|warning)$/i;
const USER_FACING_CALL = /^(?:alert|confirm|prompt)$|(?:toast|showToast|set[A-Za-z]*(?:Error|Info|Message|Feedback)|pushFieldError|getUserFacingErrorMessage)/;

function clean(value) {
  return value.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function looksLikeCopy(value) {
  if (!value || value.length < 2 || !/[a-z]/i.test(value)) return false;
  if (/^(?:https?:|\.\/|@\/|#[0-9a-f]{3,8}$)/i.test(value) || /^\/\S/.test(value)) return false;
  if (/^[a-f0-9]{24,}$/i.test(value)) return false;
  if (/^[a-z0-9]+(?:[-_.:/][a-z0-9]+)+$/.test(value)) return false;
  if (/^[A-Z0-9_]+$/.test(value)) return false;
  if (/^(?:!?[a-z0-9]+:)?(?:h|w|min-h|min-w|max-h|max-w|bg|text|border|opacity|animate|from|to|rounded|font|shadow|flex|grid|block|hidden|relative|absolute|fixed|sticky|inline|space|gap|p|m)-/.test(value)) return false;
  return /\s/.test(value) || /^[A-Z][a-z]/.test(value) || /[.!?]$/.test(value);
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : "";
}

function functionName(node) {
  if (ts.isFunctionDeclaration(node)) return node.name?.text ?? "";
  const parent = node.parent;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : "";
}

function containingFunction(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isReceiptValueProperty(node) {
  if (!ts.isPropertyAssignment(node) || propertyName(node.name) !== "value") return false;
  const object = node.parent;
  if (!ts.isObjectLiteralExpression(object)) return false;
  return object.properties.some(
    (property) => ts.isPropertyAssignment(property) && ["label", "detail", "tone"].includes(propertyName(property.name))
  );
}

function isUserFacingProperty(node) {
  return ts.isPropertyAssignment(node) &&
    (USER_FACING_PROPERTIES.has(propertyName(node.name)) || isReceiptValueProperty(node));
}

function isUserFacingLabelMapProperty(node) {
  if (!ts.isPropertyAssignment(node) || !ts.isObjectLiteralExpression(node.parent)) return false;
  const declaration = node.parent.parent;
  return ts.isVariableDeclaration(declaration) &&
    ts.isIdentifier(declaration.name) &&
    /LABELS$/.test(declaration.name.text);
}

function staticText(node, source) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.getText(source).slice(1, -1);
  return null;
}

function collectIdentifiers(node, output) {
  if (ts.isIdentifier(node)) {
    output.add(node.text);
    return;
  }
  ts.forEachChild(node, (child) => collectIdentifiers(child, output));
}

export function findUntranslatedCopy(sourceText, fileName = "fixture.tsx") {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const declarations = new Map();
  const renderedBindings = new Set();
  const findings = [];
  const seen = new Set();

  function record(node, raw, context, signal = raw) {
    const text = clean(raw);
    if (!looksLikeCopy(clean(signal))) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const key = `${line}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ line, text, context });
  }

  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer);
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      const name = node.name.getText(source);
      if (USER_FACING_ATTRIBUTES.has(name) || USER_FACING_PROPERTIES.has(name)) {
        collectIdentifiers(node.initializer.expression, renderedBindings);
      }
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      collectIdentifiers(node.expression, renderedBindings);
    } else if (isUserFacingProperty(node)) {
      collectIdentifiers(node.initializer, renderedBindings);
    } else if (ts.isCallExpression(node) && USER_FACING_CALL.test(node.expression.getText(source))) {
      node.arguments.forEach((argument) => collectIdentifiers(argument, renderedBindings));
    }
    ts.forEachChild(node, collect);
  }
  collect(source);

  let previousSize = -1;
  while (previousSize !== renderedBindings.size) {
    previousSize = renderedBindings.size;
    for (const name of [...renderedBindings]) {
      const initializer = declarations.get(name);
      if (initializer) collectIdentifiers(initializer, renderedBindings);
    }
  }

  function inspectExpression(node, context) {
    const text = staticText(node, source);
    if (text !== null) {
      const signal = ts.isTemplateExpression(node)
        ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ")
        : text;
      record(node, text, context, signal);
    }
    if (ts.isConditionalExpression(node)) {
      inspectExpression(node.whenTrue, context);
      inspectExpression(node.whenFalse, context);
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      inspectExpression(node.left, context);
      inspectExpression(node.right, context);
    } else if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element) => inspectExpression(element, context));
    }
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      record(node, node.getText(source), "jsx");
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(source);
      if (USER_FACING_ATTRIBUTES.has(name) || USER_FACING_PROPERTIES.has(name)) {
        record(node.initializer, node.initializer.text, `attribute:${name}`);
      }
    } else if (isUserFacingProperty(node) || isUserFacingLabelMapProperty(node)) {
      inspectExpression(node.initializer, `property:${propertyName(node.name)}`);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const internalName = /(?:id|key)$/i.test(node.name.text) || ["label", "entryLabel", "appliedStarterSummary"].includes(node.name.text);
      if (!internalName && (USER_FACING_VARIABLE.test(node.name.text) || renderedBindings.has(node.name.text))) {
        inspectExpression(node.initializer, `variable:${node.name.text}`);
      }
    } else if (
      ts.isReturnStatement(node) &&
      node.expression
    ) {
      const fn = containingFunction(node);
      if (fn && USER_FACING_FUNCTION.test(functionName(fn))) inspectExpression(node.expression, `return:${functionName(fn)}`);
    } else if (
      ts.isArrowFunction(node) &&
      (ts.isStringLiteralLike(node.body) || ts.isTemplateExpression(node.body)) &&
      ts.isPropertyAssignment(node.parent) &&
      propertyName(node.parent.name) === "phrase"
    ) {
      inspectExpression(node.body, "arrow-return:phrase");
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}
