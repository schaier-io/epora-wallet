import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

// invalidateQueries is a no-op on a query that is missing or already invalidated,
// so a cache slot written outside Query compares this counter to detect it.
const chainGenerations = new WeakMap<QueryClient, number>();

export function chainGeneration(client: QueryClient): number {
  return chainGenerations.get(client) ?? 0;
}

export function bumpChainGeneration(client: QueryClient): void {
  chainGenerations.set(client, chainGeneration(client) + 1);
}

/**
 * Invalidate inactive entries too, so returning to a screen cannot reuse pre-submit state.
 * Found transactions are immutable, so their entries stay fresh.
 */
export async function invalidateChainQueries(client: QueryClient): Promise<void> {
  bumpChainGeneration(client);
  await Promise.all([
    client.invalidateQueries({ predicate: query =>
      query.meta?.chainDependent === true || (query.queryKey[0] === queryKeys.chain[0] &&
      query.queryKey[1] === queryKeys.chain[1] && query.queryKey[2] !== "asset-metadata" &&
      query.queryKey[2] !== "protocol" && query.queryKey[2] !== "transaction") }),
    client.invalidateQueries({ queryKey: queryKeys.signer })
  ]);
}
