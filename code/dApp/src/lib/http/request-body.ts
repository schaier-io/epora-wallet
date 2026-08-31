import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibHttpRequestBody.json";

const i18n = createDefaultTranslator("LibHttpRequestBody", defaultMessages);

const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;

// `JSON.parse` accepts nesting far deeper than anything that reads the result
// can survive: zod's recursive PlutusData schema overflows the stack at roughly
// 15,000 levels, which fits inside a 32 KB body. A real state datum measures 6
// levels deep (VERIFIED, by encoding the default state form), so this ceiling
// is an order of magnitude above any legitimate body and two orders below the
// depth that breaks a parser.
const MAX_JSON_DEPTH = 64;

/** The body is not JSON. The caller's fault, so routes map it to 400. */
export class InvalidJsonError extends Error {
  constructor() {
    super("Request body is not valid JSON.");
    this.name = "InvalidJsonError";
  }
}

/** The body nests deeper than any real request. Routes map it to 400. */
export class RequestBodyTooDeepError extends Error {
  constructor(readonly maxDepth: number) {
    super(`Request body nests deeper than ${maxDepth} levels.`);
    this.name = "RequestBodyTooDeepError";
  }
}

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(i18n("requestBodyTooLarge", { maxBytes }));
    this.name = "RequestBodyTooLargeError";
  }
}

/**
 * Walk a parsed body iteratively and reject one nested past the ceiling.
 *
 * Iteratively on purpose: a recursive check would overflow on exactly the input
 * it exists to reject.
 */
function assertBoundedDepth(root: unknown, maxDepth = MAX_JSON_DEPTH) {
  const pending: { value: unknown; depth: number }[] = [{ value: root, depth: 1 }];

  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    if (typeof value !== "object" || value === null) {
      continue;
    }
    if (depth > maxDepth) {
      throw new RequestBodyTooDeepError(maxDepth);
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      pending.push({ value: child, depth: depth + 1 });
    }
  }
}

/** Stream and parse JSON while enforcing a real byte ceiling for chunked bodies. */
export async function readBoundedJson(
  request: Request,
  maxBytes = DEFAULT_MAX_JSON_BYTES
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("JSON request-body limit must be a positive safe integer.");
  }

  const claimedLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(claimedLength) && claimedLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new InvalidJsonError();
  }

  const decoder = new TextDecoder();
  let byteCount = 0;
  let body = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    byteCount += chunk.value.byteLength;
    if (byteCount > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLargeError(maxBytes);
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();

  // `JSON.parse` raises a bare SyntaxError, which a route cannot tell apart
  // from a syntax error thrown anywhere else in its own try block. Typing it
  // here is what lets the route answer 400 rather than logging a 500.
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new InvalidJsonError();
  }

  assertBoundedDepth(parsed);
  return parsed;
}
