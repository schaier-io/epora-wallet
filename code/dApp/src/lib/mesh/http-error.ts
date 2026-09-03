// Mesh's BlockfrostProvider throws every HTTP failure as a JSON string built by
// its parseHttpError: `{ data, headers, status }` when the server answered,
// `{ code, message }` or the raw request when it did not.
export function meshHttpStatus(error: unknown): number | null {
  if (typeof error !== "string") return null;
  try {
    const status = (JSON.parse(error) as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  } catch {
    return null;
  }
}
