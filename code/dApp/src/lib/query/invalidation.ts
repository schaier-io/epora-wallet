import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

/**
 * Invalidate inactive entries too, so returning to a screen cannot reuse pre-submit state.
 * Found transactions are immutable, so their entries stay fresh.
 */
export async function invalidateChainQueries(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ predicate: query =>
      query.meta?.chainDependent === true || (query.queryKey[0] === queryKeys.chain[0] &&
      query.queryKey[1] === queryKeys.chain[1] && query.queryKey[2] !== "asset-metadata" &&
      query.queryKey[2] !== "protocol" && query.queryKey[2] !== "transaction") }),
    client.invalidateQueries({ queryKey: queryKeys.signer })
  ]);
}
