const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;

/** The body is not JSON. The caller's fault, so routes map it to 400. */
export class InvalidJsonError extends Error {
  constructor() {
    super("Request body is not valid JSON.");
    this.name = "InvalidJsonError";
  }
}

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = "RequestBodyTooLargeError";
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
  try {
    return JSON.parse(body);
  } catch {
    throw new InvalidJsonError();
  }
}
