import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore, Provider } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import type { PropsWithChildren } from "react";
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
