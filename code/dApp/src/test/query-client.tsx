import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore, Provider } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { useMemo, type PropsWithChildren } from "react";
import { createAppQueryClient } from "@/lib/query/client";

type Store = ReturnType<typeof createStore>;

export function createQueryTestWrapper(options: { queryClient?: QueryClient; jotaiStore?: Store } = {}) {
  const queryClient = options.queryClient ?? createAppQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false, gcTime: Infinity }
  });
  const store = options.jotaiStore ?? createStore();
  store.set(queryClientAtom, queryClient);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}><Provider store={store}>{children}</Provider></QueryClientProvider>
  );
  return { wrapper, queryClient, store };
}

/**
 * The same provider stack as a component, for tests that render JSX directly instead of
 * through render's `wrapper` option.
 *
 * A component that calls `useQuery` throws without a QueryClientProvider, and that now
 * includes editors that look like plain forms: the co-signer card reads who has already
 * registered. Tests reach for this rather than jotai's `Provider` alone.
 */
export function TestProviders({
  store,
  queryClient,
  children
}: PropsWithChildren<{ store?: Store; queryClient?: QueryClient }>) {
  const providers = useMemo(
    () => createQueryTestWrapper({ jotaiStore: store, queryClient }),
    [store, queryClient]
  );
  return <providers.wrapper>{children}</providers.wrapper>;
}
