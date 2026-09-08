/** HTTP Retry-After can be a delay in seconds or an absolute HTTP date. */
export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    const delay = seconds * 1_000;
    return seconds >= 0 && Number.isFinite(delay) ? delay : undefined;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(date - Date.now(), 0) : undefined;
}
