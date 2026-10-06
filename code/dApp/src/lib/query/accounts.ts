"use client";

import { queryOptions } from "@tanstack/react-query";
import { AccountsResponseSchema } from "@/lib/api/accounts";
import { parseRetryAfterMs } from "@/lib/mesh/server-fetcher";
import { queryKeys } from "./keys";

// `status` and `retryAfterMs` feed `retryQuery`/`queryRetryDelay`: a 400 is final, and a
// 429 waits as long as the server asked.
class StakeAccountLookupError extends Error {
  constructor(readonly status: number, readonly retryAfterMs?: number) {
    super("Stake account lookup failed.");
    this.name = "StakeAccountLookupError";
  }
}

export const stakeAccountQueryOptions = (address: string) => queryOptions({
  queryKey: queryKeys.stakeAccount(address),
  queryFn: async ({ signal }) => {
    const response = await fetch(`/api/v1/accounts?address=${encodeURIComponent(address)}`, { signal });
    if (!response.ok) {
      throw new StakeAccountLookupError(response.status, parseRetryAfterMs(response.headers.get("Retry-After")));
    }
    const parsed = AccountsResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new StakeAccountLookupError(502);
    return parsed.data.account;
  }
});
