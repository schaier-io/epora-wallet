"use client";

import dynamic from "next/dynamic";
import { LazyChunkFallback } from "@/components/ui/lazy-chunk-fallback";

/**
 * The workspace's module graph reaches the Cardano serialisation stack
 * (lib/mesh/*, lib/contracts/blueprint, lib/contracts/state-form, ...). Loading
 * it client-only through this boundary turns that weight into an async chunk,
 * so it no longer sits on the /user route's first load (issue #410; guarded by
 * app/layout-mesh-boundary.test.ts). The workspace is an interactive wallet
 * screen: without JavaScript the server HTML was inert anyway, so the shell
 * renders skeletons until the chunk arrives.
 */
const UserActionsPage = dynamic(
  () =>
    import("@/components/user/permission-wallet-shells").then(mod => ({
      default: mod.GuidedPermissionWalletWorkspace
    })),
  {
    ssr: false,
    loading: () => (
      <LazyChunkFallback cards={2} />
    )
  }
);

export { UserActionsPage };
