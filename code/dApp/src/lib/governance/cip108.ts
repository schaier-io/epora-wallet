function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** CIP-108 `body.title` / `body.abstract`. Providers may return the document as a JSON string. */
export function readCip108(document: unknown): { title: string | null; abstract: string | null } {
  if (typeof document === "string") {
    try {
      document = JSON.parse(document);
    } catch {
      document = null;
    }
  }
  const body = asRecord(asRecord(document)?.body);
  return { title: asText(body?.title), abstract: asText(body?.abstract) };
}
