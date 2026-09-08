import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

/** Invalidate inactive entries too, so returning to a screen cannot reuse pre-submit state. */
export async function invalidateChainQueries(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.chain, predicate: query =>
      query.queryKey[2] !== "asset-metadata" && query.queryKey[2] !== "protocol" }),
    client.invalidateQueries({ queryKey: queryKeys.signer })
  ]);
}
