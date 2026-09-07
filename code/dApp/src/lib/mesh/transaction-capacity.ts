export type TransactionCapacityFailure = "bytes" | "execution";
/** Recognize explicit transaction limits only. Funding and validator failures need their own remedy. */
export function classifyTransactionCapacityFailure(error: unknown): TransactionCapacityFailure | null {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  while (pending.length) {
    const value = pending.pop();
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    if (typeof value === "string") {
      // Mesh 1.9.1 selector emits this only when its maxSizeExceed constraint fails.
      if (value === "Transaction size exceeds the maximum allowed size.") {
        return "bytes";
      }
      const size = value.match(/Serialized transaction uses (\d+) bytes\. The protocol limit is (\d+)\./);
      if (size && BigInt(size[1]!) > BigInt(size[2]!) && BigInt(size[2]!) > 0n) {
        return "bytes";
      }
      const execution = value.match(/Transaction uses (\d+) (?:memory|CPU) units\. The protocol limit is (\d+)\./);
      if (execution && BigInt(execution[1]!) > BigInt(execution[2]!) && BigInt(execution[2]!) > 0n) {
        return "execution";
      }
    }
    else if (value && typeof value === "object") {
      // Follow error payloads, not arbitrary diagnostic text or stack traces.
      const record = value as Record<string, unknown>;
      for (const key of ["message", "info", "error", "cause", "sourceError"]) {
        if (key in record) {
          pending.push(record[key]);
        }
      }
    }
  }
  return null;
}
