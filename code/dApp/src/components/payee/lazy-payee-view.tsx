"use client";

import dynamic from "next/dynamic";

import { PayeeCardFallback } from "@/components/payee/payee-card-fallback";

/**
 * The payee view's module graph reaches the Cardano serialisation stack
 * (lib/mesh/detection, lib/mesh/transactions, lib/contracts/blueprint, ...).
 * Loading it client-only through this boundary turns that weight into an async
 * chunk, so it no longer sits on the /payee route's first load (issue #410;
 * guarded by app/layout-mesh-boundary.test.ts). The view is an interactive
 * wallet screen: without JavaScript the server HTML was inert anyway, so the
 * shell renders skeletons until the chunk arrives.
 *
 * The loading fallback is the card shell (payee-card-fallback), not a bare
 * skeleton: the header is static text, and painting it with the server HTML
 * keeps the route's largest text from waiting on the multi-megabyte chunk
 * (issue #502).
 */
const LazyPayeeView = dynamic(
  () => import("@/components/payee/payee-view").then(mod => ({ default: mod.PayeeView })),
  {
    ssr: false,
    loading: () => <PayeeCardFallback />
  }
);

export { LazyPayeeView };
