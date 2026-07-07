// Canonical unknown→message extraction. Use this instead of hand-rolling
// `error instanceof Error ? error.message : "…"` at call sites.
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
