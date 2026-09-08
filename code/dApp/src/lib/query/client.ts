import { QueryClient } from "@tanstack/react-query";
import { queryPolicy } from "./keys";

function httpStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return undefined;
}

export function retryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return false;
  const status = httpStatus(error);
  if (status !== undefined && status < 500 && status !== 408 && status !== 429) return false;
  return failureCount < queryPolicy.retryCount;
}

export function queryRetryDelay(attempt: number, error: unknown): number {
  if (error && typeof error === "object" && "retryAfterMs" in error &&
      typeof error.retryAfterMs === "number" && Number.isFinite(error.retryAfterMs)) {
    return Math.max(0, error.retryAfterMs);
  }
  return Math.min(queryPolicy.retryMaxMs, queryPolicy.retryBaseMs * 2 ** attempt);
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: queryPolicy.chainStaleMs,
        gcTime: queryPolicy.chainGcMs,
        retry: retryQuery,
        retryDelay: queryRetryDelay,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true
      },
      // An offline signing/submission must fail, not resume later without a new intent.
      mutations: { retry: false, networkMode: "always" }
    }
  });
}
