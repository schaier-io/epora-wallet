export const MAX_UNSIGNED_TX_BYTES = 64 * 1024;
export const MAX_BUILD_CONTEXT_BYTES = 256 * 1024;
export const MAX_BUILD_CONTEXT_DEPTH = 24;
export const MAX_SUMMARY_ROWS = 50;
export const MAX_SUMMARY_HEADLINE_LENGTH = 500;
export const MAX_SUMMARY_CELL_LENGTH = 2_000;
export const MAX_SUMMARY_BYTES = 256 * 1024;
export const MAX_WITNESS_SET_BYTES = 32 * 1024;
export const MAX_OPEN_PROPOSALS_PER_CREATOR_WALLET = 25;
export const MAX_PROPOSALS_PER_CREATOR_WALLET_PER_DAY = 100;
export const DEFAULT_PROPOSAL_PAGE_SIZE = 25;
export const MAX_PROPOSAL_PAGE_SIZE = 50;

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** Iterative depth check: deeply nested attacker JSON cannot overflow our stack. */
export function jsonDepthWithin(value: unknown, maxDepth: number): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (current.depth > maxDepth) return false;
    if (typeof current.value !== "object" || current.value === null) continue;
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Record<string, unknown>);
    for (const child of children) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return true;
}
