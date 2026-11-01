"use client";

import { useEffect, type PropsWithChildren } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientAtomProvider } from "jotai-tanstack-query/react";
import { createAppQueryClient } from "@/lib/query/client";
import { installQueryActivityTracking } from "@/lib/query/activity";

let browserClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return createAppQueryClient();
  return browserClient ??= createAppQueryClient();
}

/** Query hooks and Jotai selectors share one cache for the browser session. */
export function QueryProvider({ children }: PropsWithChildren) {
  useEffect(installQueryActivityTracking, []);
  return <QueryClientAtomProvider client={getQueryClient()}>{children}</QueryClientAtomProvider>;
}
