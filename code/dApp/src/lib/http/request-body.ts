import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibHttpRequestBody.json";

const i18n = createDefaultTranslator("LibHttpRequestBody", defaultMessages);

const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(i18n("requestBodyTooLarge", { maxBytes }));
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
    return JSON.parse("");
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
  return JSON.parse(body);
}
